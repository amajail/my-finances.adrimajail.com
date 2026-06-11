/**
 * Azure Instructions Repository
 *
 * Implementation of IInstructionsRepository using Azure Table Storage.
 * Owns the `portfolioInstructionsHistory` table; reads/writes one specific
 * row of `portfolioSettings` (rowKey 'analysis.instructionsV1') which holds
 * the active instructions document GenerateWeeklyAnalysis uses verbatim.
 *
 * Feature: 005-editable-metaprompt. New storage (table + settings key) per
 * research.md R1 so history starts fresh; feature 004's
 * `portfolioFrameworkHistory` / `analysis.strategicFrameworkV1` are left in
 * place, orphaned and non-destructively.
 */

const IInstructionsRepository = require('../../application/interfaces/IInstructionsRepository');
const InstructionsHistoryEntry = require('../../domain/entities/InstructionsHistoryEntry');
const logger = require('../../shared/logging');

const SETTINGS_PARTITION = 'settings';
const SETTINGS_ROWKEY = 'analysis.instructionsV1';
const HISTORY_PARTITION = 'instructions';

// Azure Table Storage caps a single string property at 64 KB (32K UTF-16
// characters). The instructions document can be up to 256 KB UTF-8 (FR-006),
// so `content`/`value` are split across `<base>`, `<base>1`, `<base>2`, … with
// a `<base>Chunks` count, and reassembled on read. JS string length counts
// UTF-16 code units, matching Azure's character limit; 32000 stays safely under
// the 32768 cap. Worst case (ASCII) 256 KB → 9 chunks, well under the 1 MB /
// 252-property per-entity limits.
const CHUNK_CHARS = 32000;

function splitIntoChunks(str) {
  const s = typeof str === 'string' ? str : '';
  const chunks = [];
  for (let i = 0; i < s.length; i += CHUNK_CHARS) {
    chunks.push(s.slice(i, i + CHUNK_CHARS));
  }
  return chunks.length ? chunks : [''];
}

/** Write `content` across `<base>`, `<base>1`, … and set `<base>Chunks`. */
function setChunked(entity, base, content) {
  const chunks = splitIntoChunks(content);
  entity[base] = chunks[0];
  for (let i = 1; i < chunks.length; i += 1) {
    entity[`${base}${i}`] = chunks[i];
  }
  entity[`${base}Chunks`] = chunks.length;
}

/**
 * Reassemble a chunked value. Back-compatible: rows without `<base>Chunks`
 * (e.g. legacy single-property writes) return the plain `<base>` value. On a
 * Merge-updated settings row, stale higher chunks from a longer prior value are
 * ignored because the read is bounded by the current `<base>Chunks` count.
 */
function getChunked(entity, base) {
  const count = Number(entity[`${base}Chunks`]) || 0;
  if (count <= 1) {
    return typeof entity[base] === 'string' ? entity[base] : '';
  }
  let out = typeof entity[base] === 'string' ? entity[base] : '';
  for (let i = 1; i < count; i += 1) {
    out += typeof entity[`${base}${i}`] === 'string' ? entity[`${base}${i}`] : '';
  }
  return out;
}

class AzureInstructionsRepository extends IInstructionsRepository {
  /**
   * @param {AzureTableDatabase} [database=null] - Database instance; lazy-created when null.
   */
  constructor(database = null) {
    super();
    this._database = database;
    this._initialized = false;
  }

  async _ensureInitialized() {
    if (!this._initialized) {
      if (!this._database) {
        const AzureTableDatabase = require('../../database/AzureTableDatabase');
        this._database = new AzureTableDatabase();
      }
      await this._database.initialize();
      this._initialized = true;
    }
  }

  /**
   * @returns {Promise<{ content: string, historyRowKey: string|null, updatedAt: string|null }|null>}
   */
  async getActive() {
    await this._ensureInitialized();

    try {
      const entity = await this._database.settingsClient.getEntity(
        SETTINGS_PARTITION,
        SETTINGS_ROWKEY
      );
      return {
        content: getChunked(entity, 'value'),
        historyRowKey: entity.historyRowKey || null,
        updatedAt: entity.updatedAt || null,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      logger.error('Failed to read active instructions', error);
      throw error;
    }
  }

  /**
   * Append a new history row, then upsert the active settings row to point
   * at it. See research.md R1/R2 for failure-mode rationale.
   *
   * @param {Object} input
   * @param {string} input.content
   * @param {string|null} [input.changeNote]
   * @param {'edit'|'restore'} input.source
   * @param {string|null} [input.restoreOfRowKey]
   * @returns {Promise<InstructionsHistoryEntry>}
   */
  async saveActive({ content, changeNote = null, source, restoreOfRowKey = null }) {
    await this._ensureInitialized();

    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const rowKey = InstructionsHistoryEntry.buildRowKey(now);

    const entry = new InstructionsHistoryEntry({
      id: rowKey,
      content,
      timestamp,
      changeNote,
      source,
      restoreOfRowKey: source === 'restore' ? restoreOfRowKey : null,
    });

    // 1) Write the history row first. `content` is chunked across properties to
    //    stay under Azure's 64 KB per-property cap.
    const historyEntity = {
      partitionKey: HISTORY_PARTITION,
      rowKey: entry.id,
      timestamp: entry.timestamp,
      source: entry.source,
    };
    setChunked(historyEntity, 'content', entry.content);
    if (entry.changeNote !== null) {
      historyEntity.changeNote = entry.changeNote;
    }
    if (entry.restoreOfRowKey !== null) {
      historyEntity.restoreOfRowKey = entry.restoreOfRowKey;
    }

    try {
      await this._database.instructionsHistoryClient.createEntity(historyEntity);
    } catch (error) {
      logger.error('Failed to write instructions history entry', error);
      throw error;
    }

    // 2) Upsert the active settings row to point at the new history row.
    //    Merge mode preserves any unrelated properties on the settings row.
    try {
      const settingsEntity = {
        partitionKey: SETTINGS_PARTITION,
        rowKey: SETTINGS_ROWKEY,
        historyRowKey: entry.id,
        updatedAt: entry.timestamp,
      };
      setChunked(settingsEntity, 'value', entry.content);
      await this._database.settingsClient.upsertEntity(settingsEntity, 'Merge');
    } catch (error) {
      // Orphan-history scenario: history row exists but settings row is not
      // pointing at it. Caller surfaces as 500; next save reconciles.
      logger.error('Failed to update active instructions settings row', error);
      throw error;
    }

    return entry;
  }

  /**
   * @param {Object} options
   * @param {number} [options.limit=50] - 1..200.
   */
  async listHistory({ limit = 50 } = {}) {
    await this._ensureInitialized();

    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const out = [];

    try {
      for await (const entity of this._database.instructionsHistoryClient.listEntities({
        queryOptions: { filter: `PartitionKey eq '${HISTORY_PARTITION}'` },
      })) {
        // RowKey encoding (research R1) means natural sort = newest first.
        out.push({
          id: entity.rowKey,
          timestamp: entity.timestamp,
          changeNote: entity.changeNote || null,
          source: entity.source || 'edit',
          restoreOfRowKey: entity.restoreOfRowKey || null,
          contentBytes: Buffer.byteLength(getChunked(entity, 'content'), 'utf8'),
        });
        if (out.length >= safeLimit) {
          break;
        }
      }
      return out;
    } catch (error) {
      logger.error('Failed to list instructions history', error);
      throw error;
    }
  }

  /**
   * @param {string} rowKey
   * @returns {Promise<InstructionsHistoryEntry|null>}
   */
  async getHistoryEntry(rowKey) {
    await this._ensureInitialized();

    try {
      const entity = await this._database.instructionsHistoryClient.getEntity(HISTORY_PARTITION, rowKey);
      return new InstructionsHistoryEntry({
        id: entity.rowKey,
        content: getChunked(entity, 'content'),
        timestamp: entity.timestamp,
        changeNote: entity.changeNote || null,
        source: entity.source || 'edit',
        restoreOfRowKey: entity.restoreOfRowKey || null,
      });
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      logger.error(`Failed to fetch instructions history entry: ${rowKey}`, error);
      throw error;
    }
  }
}

module.exports = AzureInstructionsRepository;
