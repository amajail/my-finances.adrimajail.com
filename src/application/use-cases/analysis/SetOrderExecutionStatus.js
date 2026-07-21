/**
 * SetOrderExecutionStatus Use Case (feature 007)
 *
 * Records the owner-confirmed execution status (executed/partial/skipped/pending)
 * and optional note on one suggested order. Marking any order non-pending freezes
 * that week's analysis (enforced by GenerateWeeklyAnalysis via hasMarkedOrders).
 *
 * Feature 018: also records an optional execution price (stored for future
 * outcome-P&L scoring, not consumed by the scorecard yet) and appends an audit
 * entry with old/new values when an audit repository is wired (optional dep —
 * audit failures never fail the write).
 *
 * Annotation only — does NOT modify positions.
 */

const UseCase = require('../UseCase');
const { ValidationError } = require('../../../shared/errors');
const { EXECUTION_STATUSES } = require('../../../domain/entities/SuggestedOrder');
const safeAppendAudit = require('../audit/safeAppendAudit');

const NOTE_MAX = 500;

class SetOrderExecutionStatus extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAnalysisRepository} deps.analysisRepository
   * @param {IAuditRepository} [deps.auditRepository] - Optional (feature 018).
   * @param {Function} [deps.clock] - () => Date (injectable for tests)
   */
  constructor({ analysisRepository, auditRepository = null, clock = () => new Date() }) {
    super();
    this._analysisRepository = analysisRepository;
    this._auditRepository = auditRepository;
    this._clock = clock;
  }

  /**
   * @param {Object} input
   * @param {string} input.date - ISO YYYY-MM-DD.
   * @param {number} input.index - order index.
   * @param {string} input.status - one of EXECUTION_STATUSES.
   * @param {string} [input.note]
   * @param {number} [input.executionPrice] - optional positive price (feature 018).
   * @param {{ source?: string }} [input._audit] - audit context (feature 018).
   * @returns {Promise<Object>} saved status object
   */
  async execute({ date, index, status, note, executionPrice, _audit } = {}) {
    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      errors.push('date must be ISO YYYY-MM-DD');
    }
    const idx = parseInt(index, 10);
    if (!Number.isInteger(idx) || idx < 0) {
      errors.push('index must be a non-negative integer');
    }
    if (!EXECUTION_STATUSES.includes(status)) {
      errors.push(`status must be one of: ${EXECUTION_STATUSES.join(', ')}`);
    }
    if (note !== undefined && note !== null && String(note).length > NOTE_MAX) {
      errors.push(`note must be at most ${NOTE_MAX} characters`);
    }
    let price = null;
    if (executionPrice !== undefined && executionPrice !== null && executionPrice !== '') {
      price = Number(executionPrice);
      if (!Number.isFinite(price) || price <= 0) {
        errors.push('executionPrice must be a positive number when provided');
      }
    }
    if (errors.length > 0) {
      throw new ValidationError(
        errors.join('; '),
        errors.map((m) => ({ field: 'orderExecutionStatus', message: m }))
      );
    }

    const updatedAt = this._clock().toISOString();
    const saved = await this._analysisRepository.setOrderExecutionStatus(date, idx, {
      status,
      note: note != null ? String(note) : null,
      updatedAt,
      executionPrice: price,
    });

    // Feature 018: audit old→new (the repository returns pre-change values).
    const { previous, ...result } = saved;
    const changes = [];
    if (previous) {
      pushChange(changes, 'executionStatus', previous.executionStatus, result.executionStatus);
      pushChange(changes, 'executionNote', previous.executionNote, result.executionNote);
      pushChange(changes, 'executionPrice', previous.executionPrice, result.executionPrice);
    }
    await safeAppendAudit(this._auditRepository, {
      timestamp: updatedAt,
      operation: 'set_order_execution_status',
      targetType: 'order',
      targetId: `${date}/${idx}`,
      changes,
      confirmationUsed: false,
      source: (_audit && _audit.source) || 'api',
    });

    return result;
  }
}

function pushChange(changes, field, oldValue, newValue) {
  if (oldValue !== newValue) {
    changes.push({ field, old: oldValue, new: newValue });
  }
}

module.exports = SetOrderExecutionStatus;
