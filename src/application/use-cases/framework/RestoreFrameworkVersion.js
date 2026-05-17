/**
 * RestoreFrameworkVersion Use Case
 *
 * Promotes a past history entry's content to the new active framework by
 * delegating to SaveFramework with source='restore' and a restoreOfRowKey
 * pointing at the original entry. Append-only — the original entry is
 * never mutated.
 *
 * Feature: 004-editable-strategic-framework (spec FR-008).
 */

const UseCase = require('../UseCase');
const { ValidationError, NotFoundError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

const MAX_CHANGE_NOTE = 280;

class RestoreFrameworkVersion extends UseCase {
  /**
   * @param {Object} deps
   * @param {IFrameworkRepository} deps.frameworkRepository
   * @param {SaveFramework} deps.saveFramework - Shared SaveFramework instance.
   */
  constructor({ frameworkRepository, saveFramework }) {
    super();
    this._frameworkRepository = frameworkRepository;
    this._saveFramework = saveFramework;
  }

  /**
   * @param {Object} input
   * @param {string} input.rowKey - The history entry to restore.
   * @param {string|null} [input.changeNote] - Optional override for the system-generated note.
   * @returns {Promise<{ historyRowKey: string|null, timestamp: string|null, restoreOfRowKey: string, noop: boolean }>}
   */
  async execute({ rowKey, changeNote = null } = {}) {
    if (!rowKey || typeof rowKey !== 'string' || rowKey.trim().length === 0) {
      throw new ValidationError('rowKey is required', [
        { field: 'rowKey', message: 'rowKey is required' },
      ]);
    }

    // Validate changeNote length up-front so the caller sees a clean 400.
    if (changeNote !== null && changeNote !== undefined) {
      const trimmed = String(changeNote).trim();
      if (trimmed.length > MAX_CHANGE_NOTE) {
        throw new ValidationError(`changeNote exceeds ${MAX_CHANGE_NOTE} characters`, [
          { field: 'changeNote', message: `exceeds ${MAX_CHANGE_NOTE} characters` },
        ]);
      }
    }

    logger.debug('RestoreFrameworkVersion: executing', { rowKey });

    const target = await this._frameworkRepository.getHistoryEntry(rowKey);
    if (!target) {
      throw new NotFoundError('history entry', rowKey);
    }

    const effectiveNote = changeNote && String(changeNote).trim().length > 0
      ? String(changeNote).trim()
      : `Restored from ${target.timestamp}`;

    const saveResult = await this._saveFramework.execute({
      content: target.content,
      changeNote: effectiveNote,
      source: 'restore',
      restoreOfRowKey: rowKey,
    });

    return {
      historyRowKey: saveResult.historyRowKey,
      timestamp: saveResult.timestamp,
      restoreOfRowKey: rowKey,
      noop: saveResult.noop,
    };
  }
}

module.exports = RestoreFrameworkVersion;
