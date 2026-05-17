/**
 * GetFrameworkHistoryEntry Use Case
 *
 * Returns the full content + metadata for one framework history entry.
 *
 * Feature: 004-editable-strategic-framework (spec FR-007).
 */

const UseCase = require('../UseCase');
const { ValidationError, NotFoundError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

class GetFrameworkHistoryEntry extends UseCase {
  /**
   * @param {Object} deps
   * @param {IFrameworkRepository} deps.frameworkRepository
   */
  constructor({ frameworkRepository }) {
    super();
    this._frameworkRepository = frameworkRepository;
  }

  /**
   * @param {Object} input
   * @param {string} input.rowKey
   * @returns {Promise<{ rowKey, timestamp, changeNote, source, restoreOfRowKey, content }>}
   */
  async execute({ rowKey } = {}) {
    if (!rowKey || typeof rowKey !== 'string' || rowKey.trim().length === 0) {
      throw new ValidationError('rowKey is required', [
        { field: 'rowKey', message: 'rowKey is required' },
      ]);
    }

    logger.debug('GetFrameworkHistoryEntry: executing', { rowKey });

    const entry = await this._frameworkRepository.getHistoryEntry(rowKey);
    if (!entry) {
      throw new NotFoundError('history entry', rowKey);
    }

    return {
      rowKey: entry.id,
      timestamp: entry.timestamp,
      changeNote: entry.changeNote,
      source: entry.source,
      restoreOfRowKey: entry.restoreOfRowKey,
      content: entry.content,
    };
  }
}

module.exports = GetFrameworkHistoryEntry;
