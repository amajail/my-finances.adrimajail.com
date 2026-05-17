/**
 * FrameworkHistoryEntry Entity
 *
 * One immutable snapshot of the strategic framework prompt, recorded each
 * time the framework is saved through the UI (including restores).
 *
 * Owned (created) by the SaveFramework use-case; queried back via
 * IFrameworkRepository. The active framework lives in `portfolioSettings`;
 * history rows live in `portfolioFrameworkHistory`.
 *
 * Feature: 004-editable-strategic-framework (spec FR-005, FR-009, FR-017).
 */

const { ValidationError, DomainError } = require('../../shared/errors');

const SOURCES = ['edit', 'restore'];
const MAX_BYTES = 61440; // 60 KB UTF-8; comfortably under Azure Table 64 KB per-property cap.
const MAX_CHANGE_NOTE = 280;

class FrameworkHistoryEntry {
  /**
   * @param {Object} data
   * @param {string} data.id - Stable identifier, doubles as storage RowKey.
   * @param {string} data.content - Framework markdown (non-empty after trim, <= 60 KB UTF-8).
   * @param {string} data.timestamp - ISO 8601 timestamp set by the use-case.
   * @param {string|null} [data.changeNote] - Optional owner-supplied note.
   * @param {string} data.source - 'edit' | 'restore'.
   * @param {string|null} [data.restoreOfRowKey] - Target id when source === 'restore'; null otherwise.
   */
  constructor(data) {
    this._id = String(data.id || '').trim();
    this._content = typeof data.content === 'string' ? data.content : '';
    this._timestamp = String(data.timestamp || '').trim();
    const rawNote = typeof data.changeNote === 'string' ? data.changeNote.trim() : '';
    this._changeNote = rawNote.length > 0 ? rawNote : null;
    this._source = String(data.source || '').trim();
    this._restoreOfRowKey = data.restoreOfRowKey ? String(data.restoreOfRowKey).trim() : null;

    this._validate();
    Object.freeze(this);
  }

  _validate() {
    const errors = [];

    if (!this._id) {
      errors.push('id is required');
    }
    if (!this._timestamp) {
      errors.push('timestamp is required');
    }

    const trimmedContent = this._content.trim();
    if (!trimmedContent) {
      errors.push('content is required');
    } else {
      const byteLength = Buffer.byteLength(this._content, 'utf8');
      if (byteLength > MAX_BYTES) {
        errors.push(`content exceeds maximum size of ${MAX_BYTES} bytes (got ${byteLength})`);
      }
    }

    if (!SOURCES.includes(this._source)) {
      errors.push(`source must be one of: ${SOURCES.join(', ')}`);
    } else if (this._source === 'restore' && !this._restoreOfRowKey) {
      errors.push('restoreOfRowKey is required when source is "restore"');
    } else if (this._source === 'edit' && this._restoreOfRowKey) {
      errors.push('restoreOfRowKey must be null when source is "edit"');
    }

    if (this._changeNote && this._changeNote.length > MAX_CHANGE_NOTE) {
      errors.push(`changeNote exceeds ${MAX_CHANGE_NOTE} characters`);
    }

    if (errors.length > 0) {
      throw new DomainError(
        errors.join('; '),
        { entity: 'FrameworkHistoryEntry', errors }
      );
    }
  }

  get id() { return this._id; }
  get content() { return this._content; }
  get timestamp() { return this._timestamp; }
  get changeNote() { return this._changeNote; }
  get source() { return this._source; }
  get restoreOfRowKey() { return this._restoreOfRowKey; }

  /**
   * Build a row-key per the design in research.md (R1):
   *   descTimestamp (13 chars) + '-' + 4 random hex chars
   * descTimestamp = (9_999_999_999_999 - epochMs).padStart(13).
   * The result sorts ascending in storage = newest-first when listed.
   *
   * @param {number} epochMs - Default Date.now()
   * @returns {string}
   */
  static buildRowKey(epochMs = Date.now()) {
    const desc = (9999999999999 - epochMs).toString().padStart(13, '0');
    const nonce = require('crypto').randomBytes(2).toString('hex');
    return `${desc}-${nonce}`;
  }

  /**
   * Maximum allowed UTF-8 byte length for `content`.
   */
  static get MAX_BYTES() { return MAX_BYTES; }

  toJSON() {
    return {
      id: this._id,
      content: this._content,
      timestamp: this._timestamp,
      changeNote: this._changeNote,
      source: this._source,
      restoreOfRowKey: this._restoreOfRowKey,
    };
  }
}

// Ensure ValidationError is reachable for callers who want to throw it pre-construction;
// keep the import even when unused locally to surface the symbol via require cache.
void ValidationError;

module.exports = FrameworkHistoryEntry;
