/**
 * IAuditRepository Interface
 *
 * Repository interface for the append-only write-audit trail (feature 018).
 * Every successful write through the agent (MCP) or API path appends one
 * immutable entry; entries are only ever listed, never updated or deleted.
 * Infrastructure layer will implement this interface.
 */

/**
 * @typedef {Object} AuditEntry
 * @property {string} timestamp - ISO 8601 time of the write.
 * @property {string} operation - update_position | create_position | set_order_execution_status | price_refresh.
 * @property {string} targetType - position | order | prices.
 * @property {string} targetId - e.g. "{brokerId}/{rowKey}", "{analysisDate}/{index}", "all-open".
 * @property {Array<{field: string, old: *, new: *}>} changes - Field-level old/new values.
 * @property {Object|null} [details] - Operation extras (e.g. refresh counts).
 * @property {boolean} [confirmationUsed] - True when the over-threshold confirm flag was used.
 * @property {string} [source] - mcp | api | timer.
 */

/**
 * Audit Repository Interface
 * @interface
 */
class IAuditRepository {
  /**
   * Append one audit entry (timestamp is set by the repository when absent).
   * @param {AuditEntry} entry
   * @returns {Promise<void>}
   * @abstract
   */
  async append(entry) {
    throw new Error('Method not implemented: append');
  }

  /**
   * List the most recent audit entries, newest first.
   * @param {number} [limit=20] - Clamped to 1..100.
   * @returns {Promise<AuditEntry[]>}
   * @abstract
   */
  async listRecent(limit) {
    throw new Error('Method not implemented: listRecent');
  }
}

module.exports = IAuditRepository;
