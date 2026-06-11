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
        content: typeof entity.value === 'string' ? entity.value : '',
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

    // 1) Write the history row first.
    const historyEntity = {
      partitionKey: HISTORY_PARTITION,
      rowKey: entry.id,
      content: entry.content,
      timestamp: entry.timestamp,
      source: entry.source,
    };
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
      await this._database.settingsClient.upsertEntity(
        {
          partitionKey: SETTINGS_PARTITION,
          rowKey: SETTINGS_ROWKEY,
          value: entry.content,
          historyRowKey: entry.id,
          updatedAt: entry.timestamp,
        },
        'Merge'
      );
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
          contentBytes: Buffer.byteLength(entity.content || '', 'utf8'),
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
        content: entity.content,
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
