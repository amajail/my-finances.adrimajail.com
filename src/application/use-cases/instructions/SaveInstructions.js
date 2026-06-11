/**
 * SaveInstructions Use Case
 *
 * Validates input, performs no-op detection against the current active
 * instructions document, and (when the save is real) delegates persistence to
 * the repository — which writes a new immutable history entry AND updates the
 * active settings row to point at it.
 *
 * Feature: 005-editable-metaprompt
 * Covers: FR-002, FR-004, FR-005, FR-006, FR-007, FR-008.
 */

const UseCase = require('../UseCase');
const InstructionsHistoryEntry = require('../../../domain/entities/InstructionsHistoryEntry');
const { ValidationError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

const MAX_CHANGE_NOTE = 280;

/**
 * Normalize content for byte-for-byte comparison: CRLF → LF, then trim.
 * Same normalization is applied to both sides before equality.
 * @param {string} s
 * @returns {string}
 */
function normalizeForCompare(s) {
  return String(s ?? '').replace(/\r\n/g, '\n').trim();
}

class SaveInstructions extends UseCase {
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
   * @param {string} input.content
   * @param {string|null} [input.changeNote]
   * @param {'edit'|'restore'} [input.source='edit']
   * @param {string|null} [input.restoreOfRowKey]
   * @returns {Promise<{ historyRowKey: string|null, timestamp: string|null, noop: boolean }>}
   */
  async execute({ content, changeNote = null, source = 'edit', restoreOfRowKey = null } = {}) {
    // 1. Content present + non-empty after trim (FR-005).
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ValidationError('content is required', [
        { field: 'content', message: 'content is required' },
      ]);
    }

    // 2. Size cap (FR-006).
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > InstructionsHistoryEntry.MAX_BYTES) {
      throw new ValidationError(
        `content exceeds maximum size of ${InstructionsHistoryEntry.MAX_BYTES} bytes (got ${bytes})`,
        [{ field: 'content', message: `exceeds ${InstructionsHistoryEntry.MAX_BYTES} bytes (got ${bytes})` }]
      );
    }

    // 3. changeNote length (entity also enforces, but we want the cleaner
    //    400 error envelope from the use-case layer).
    let normalizedNote = null;
    if (changeNote !== null && changeNote !== undefined) {
      const trimmed = String(changeNote).trim();
      if (trimmed.length > MAX_CHANGE_NOTE) {
        throw new ValidationError(`changeNote exceeds ${MAX_CHANGE_NOTE} characters`, [
          { field: 'changeNote', message: `exceeds ${MAX_CHANGE_NOTE} characters` },
        ]);
      }
      normalizedNote = trimmed.length > 0 ? trimmed : null;
    }

    // 4. No-op detection (FR-007): compare normalized content against active.
    const active = await this._instructionsRepository.getActive();
    if (active) {
      const a = normalizeForCompare(active.content);
      const b = normalizeForCompare(content);
      if (a === b) {
        logger.debug('SaveInstructions: no-op (content matches active)');
        return {
          historyRowKey: active.historyRowKey,
          timestamp: active.updatedAt,
          noop: true,
        };
      }
    }

    // 5. Persist.
    const entry = await this._instructionsRepository.saveActive({
      content,
      changeNote: normalizedNote,
      source,
      restoreOfRowKey: source === 'restore' ? restoreOfRowKey : null,
    });

    logger.info('Instructions saved', {
      historyRowKey: entry.id,
      source: entry.source,
      bytes,
    });

    return {
      historyRowKey: entry.id,
      timestamp: entry.timestamp,
      noop: false,
    };
  }
}

module.exports = SaveInstructions;
