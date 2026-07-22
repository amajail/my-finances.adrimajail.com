/**
 * ListAuditEntries Use Case (feature 018)
 *
 * Returns the most recent write-audit entries, newest first. Read-only
 * companion to the MCP write tools — makes the audit trail queryable
 * (spec FR-006).
 */

const UseCase = require('../UseCase');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

class ListAuditEntries extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAuditRepository} deps.auditRepository
   */
  constructor({ auditRepository }) {
    super();
    this._auditRepository = auditRepository;
  }

  /**
   * @param {Object} [input]
   * @param {number} [input.limit] - Clamped to 1..100, default 20.
   * @returns {Promise<{ count: number, entries: Object[] }>}
   */
  async execute({ limit } = {}) {
    const parsed = parseInt(limit, 10);
    const safeLimit = Number.isNaN(parsed)
      ? DEFAULT_LIMIT
      : Math.max(1, Math.min(MAX_LIMIT, parsed));
    const entries = await this._auditRepository.listRecent(safeLimit);
    return { count: entries.length, entries };
  }
}

module.exports = ListAuditEntries;
