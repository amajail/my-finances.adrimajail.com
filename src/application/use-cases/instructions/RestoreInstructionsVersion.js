/**
 * RestoreInstructionsVersion Use Case
 *
 * Promotes a past history entry's content to the new active instructions
 * document by delegating to SaveInstructions with source='restore' and a
 * restoreOfRowKey pointing at the original entry. Append-only — the original
 * entry is never mutated.
 *
 * Feature: 005-editable-metaprompt (spec FR-011).
 */

const UseCase = require('../UseCase');
const { ValidationError, NotFoundError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

const MAX_CHANGE_NOTE = 280;

class RestoreInstructionsVersion extends UseCase {
  /**
   * @param {Object} deps
   * @param {IInstructionsRepository} deps.instructionsRepository
   * @param {SaveInstructions} deps.saveInstructions - Shared SaveInstructions instance.
   */
  constructor({ instructionsRepository, saveInstructions }) {
    super();
    this._instructionsRepository = instructionsRepository;
    this._saveInstructions = saveInstructions;
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

    logger.debug('RestoreInstructionsVersion: executing', { rowKey });

    const target = await this._instructionsRepository.getHistoryEntry(rowKey);
    if (!target) {
      throw new NotFoundError('history entry', rowKey);
    }

    const effectiveNote = changeNote && String(changeNote).trim().length > 0
      ? String(changeNote).trim()
      : `Restored from ${target.timestamp}`;

    const saveResult = await this._saveInstructions.execute({
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

module.exports = RestoreInstructionsVersion;
