/**
 * GetInstructionsHistoryEntry Use Case
 *
 * Returns the full content + metadata for one instructions history entry.
 *
 * Feature: 005-editable-metaprompt (spec FR-010).
 */

const UseCase = require('../UseCase');
const { ValidationError, NotFoundError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

class GetInstructionsHistoryEntry extends UseCase {
  /**
   * @param {Object} deps
   * @param {IInstructionsRepository} deps.instructionsRepository
   */
  constructor({ instructionsRepository }) {
    super();
    this._instructionsRepository = instructionsRepository;
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

    logger.debug('GetInstructionsHistoryEntry: executing', { rowKey });

    const entry = await this._instructionsRepository.getHistoryEntry(rowKey);
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

module.exports = GetInstructionsHistoryEntry;
