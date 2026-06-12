/**
 * SetOrderExecutionStatus Use Case (feature 007)
 *
 * Records the owner-confirmed execution status (executed/partial/skipped/pending)
 * and optional note on one suggested order. Marking any order non-pending freezes
 * that week's analysis (enforced by GenerateWeeklyAnalysis via hasMarkedOrders).
 *
 * Annotation only — does NOT modify positions.
 */

const UseCase = require('../UseCase');
const { ValidationError } = require('../../../shared/errors');
const { EXECUTION_STATUSES } = require('../../../domain/entities/SuggestedOrder');

const NOTE_MAX = 500;

class SetOrderExecutionStatus extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAnalysisRepository} deps.analysisRepository
   * @param {Function} [deps.clock] - () => Date (injectable for tests)
   */
  constructor({ analysisRepository, clock = () => new Date() }) {
    super();
    this._analysisRepository = analysisRepository;
    this._clock = clock;
  }

  /**
   * @param {Object} input
   * @param {string} input.date - ISO YYYY-MM-DD.
   * @param {number} input.index - order index.
   * @param {string} input.status - one of EXECUTION_STATUSES.
   * @param {string} [input.note]
   * @returns {Promise<Object>} saved status object
   */
  async execute({ date, index, status, note } = {}) {
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
    if (errors.length > 0) {
      throw new ValidationError(
        errors.join('; '),
        errors.map((m) => ({ field: 'orderExecutionStatus', message: m }))
      );
    }

    const updatedAt = this._clock().toISOString();
    return this._analysisRepository.setOrderExecutionStatus(date, idx, {
      status,
      note: note != null ? String(note) : null,
      updatedAt,
    });
  }
}

module.exports = SetOrderExecutionStatus;
