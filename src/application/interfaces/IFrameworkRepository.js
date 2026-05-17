/**
 * IFrameworkRepository Interface
 *
 * Repository interface for the editable Strategic Framework feature
 * (004-editable-strategic-framework).
 *
 * Backed at the infrastructure layer by AzureFrameworkRepository, which:
 *   - reads the active framework from the `portfolioSettings` row
 *     `partitionKey='settings', rowKey='analysis.strategicFrameworkV1'`
 *   - writes immutable history rows to the `portfolioFrameworkHistory`
 *     table (single partition, descending-timestamp rowKey).
 *
 * History is append-only at this interface: there is no delete or update
 * method on a history entry (FR-009).
 */

/**
 * @interface
 */
class IFrameworkRepository {
  /**
   * Get the currently active framework.
   *
   * @returns {Promise<{ content: string, historyRowKey: string|null, updatedAt: string|null }|null>}
   *   Resolves to null if the settings row literally does not exist.
   *   `historyRowKey` and `updatedAt` are null when the active row is the
   *   pre-feature seeded content (no history entry produced it).
   * @abstract
   */
  async getActive() {
    throw new Error('Method not implemented: getActive');
  }

  /**
   * Atomically: append a new history row AND update the active settings row
   * to reference that new row's content + id.
   *
   * Implementations should write history first, then upsert the settings row
   * (see research.md R2). A failure between the two writes leaves a harmless
   * orphan history row; the next save attempt re-establishes consistency.
   *
   * @param {Object} input
   * @param {string} input.content - Non-empty, <= 60 KB UTF-8.
   * @param {string|null} [input.changeNote]
   * @param {'edit'|'restore'} input.source
   * @param {string|null} [input.restoreOfRowKey]
   * @returns {Promise<FrameworkHistoryEntry>} The newly created entry.
   * @abstract
   */
  async saveActive(_input) {
    throw new Error('Method not implemented: saveActive');
  }

  /**
   * List history entries, newest first, with `content` replaced by
   * `contentBytes` (number) to keep the list payload small. Callers that need
   * full content of a specific entry should use `getHistoryEntry(rowKey)`.
   *
   * @param {Object} options
   * @param {number} [options.limit=50] - 1..200.
   * @returns {Promise<Array<{ id: string, timestamp: string, changeNote: string|null, source: string, restoreOfRowKey: string|null, contentBytes: number }>>}
   * @abstract
   */
  async listHistory(_options) {
    throw new Error('Method not implemented: listHistory');
  }

  /**
   * Fetch a single history entry (with full content) by id.
   *
   * @param {string} rowKey
   * @returns {Promise<FrameworkHistoryEntry|null>}
   * @abstract
   */
  async getHistoryEntry(_rowKey) {
    throw new Error('Method not implemented: getHistoryEntry');
  }
}

module.exports = IFrameworkRepository;
