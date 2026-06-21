/**
 * Azure Analysis Repository
 *
 * Implementation of IAnalysisRepository using Azure Table Storage.
 * Owns the `portfolioAnalysis` and `portfolioOrders` tables.
 *
 * Re-run semantics (feature 002, FR-021): a re-run for an existing target
 * date overwrites the analysis row and REPLACES the orders for that date
 * (prior order rows are deleted first). There is no merge — per Clarification
 * Q1, no per-order state survives between runs.
 *
 * Feature: 002-weekly-rebalance-analysis.
 */

const IAnalysisRepository = require('../../application/interfaces/IAnalysisRepository');
const WeeklyAnalysis = require('../../domain/entities/WeeklyAnalysis');
const SuggestedOrder = require('../../domain/entities/SuggestedOrder');
const logger = require('../../shared/logging');
const { NotFoundError } = require('../../shared/errors');

class AzureAnalysisRepository extends IAnalysisRepository {
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
   * @param {number} [limit=20]
   * @returns {Promise<WeeklyAnalysis[]>}
   */
  async getLatest(limit = 20) {
    await this._ensureInitialized();

    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
    const rows = [];
    try {
      // Single-partition design: PartitionKey is always 'weekly'. Pull all and
      // sort newest first; row count per year is tiny (~52), so we don't
      // bother with server-side ranges.
      for await (const entity of this._database.analysisClient.listEntities({
        queryOptions: { filter: "PartitionKey eq 'weekly'" },
      })) {
        rows.push(this._analysisFromEntity(entity));
      }
      rows.sort((a, b) => b.date.localeCompare(a.date));
      return rows.slice(0, safeLimit);
    } catch (error) {
      logger.error('Failed to list weekly analyses', error);
      throw error;
    }
  }

  /**
   * @param {string} date - ISO YYYY-MM-DD
   * @returns {Promise<{ analysis: WeeklyAnalysis, orders: SuggestedOrder[] }|null>}
   */
  async getByDate(date) {
    await this._ensureInitialized();

    let analysisEntity;
    try {
      analysisEntity = await this._database.analysisClient.getEntity('weekly', date);
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      logger.error(`Failed to fetch analysis for ${date}`, error);
      throw error;
    }

    const orders = [];
    try {
      for await (const entity of this._database.ordersClient.listEntities({
        queryOptions: { filter: `PartitionKey eq '${date}'` },
      })) {
        orders.push(this._orderFromEntity(entity));
      }
      orders.sort((a, b) => a.index - b.index);
    } catch (error) {
      logger.error(`Failed to fetch orders for ${date}`, error);
      throw error;
    }

    return {
      analysis: this._analysisFromEntity(analysisEntity),
      orders,
    };
  }

  /**
   * @param {WeeklyAnalysis} weeklyAnalysis
   * @param {SuggestedOrder[]} suggestedOrders
   * @returns {Promise<void>}
   */
  async upsert(weeklyAnalysis, suggestedOrders) {
    await this._ensureInitialized();

    // 1. Delete prior orders for this date (replace semantics, FR-021).
    try {
      const priorRowKeys = [];
      for await (const entity of this._database.ordersClient.listEntities({
        queryOptions: { filter: `PartitionKey eq '${weeklyAnalysis.date}'` },
      })) {
        priorRowKeys.push(entity.rowKey);
      }
      for (const rowKey of priorRowKeys) {
        try {
          await this._database.ordersClient.deleteEntity(weeklyAnalysis.date, rowKey);
        } catch (delErr) {
          if (delErr.statusCode !== 404) throw delErr;
        }
      }
    } catch (error) {
      logger.error(`Failed to clear prior orders for ${weeklyAnalysis.date}`, error);
      throw error;
    }

    // 2. Upsert the analysis row.
    try {
      await this._database.analysisClient.upsertEntity(
        this._analysisToEntity(weeklyAnalysis),
        'Replace'
      );
    } catch (error) {
      logger.error(`Failed to upsert analysis for ${weeklyAnalysis.date}`, error);
      throw error;
    }

    // 3. Write the new orders.
    for (const order of suggestedOrders) {
      try {
        await this._database.ordersClient.upsertEntity(
          this._orderToEntity(order),
          'Replace'
        );
      } catch (error) {
        logger.error(`Failed to upsert order ${order.index} for ${weeklyAnalysis.date}`, error);
        throw error;
      }
    }

    logger.debug(`Persisted weekly analysis ${weeklyAnalysis.date} with ${suggestedOrders.length} orders`);
  }

  /**
   * Feature 007: Merge-patch the execution status columns on one order row.
   * @param {string} date
   * @param {number} index
   * @param {{ status: string, note?: string|null, updatedAt: string }} patch
   */
  async setOrderExecutionStatus(date, index, { status, note, updatedAt }) {
    await this._ensureInitialized();
    const id = SuggestedOrder.id(date, index);

    // Confirm the order exists (404 → NotFoundError).
    try {
      await this._database.ordersClient.getEntity(id.partitionKey, id.rowKey);
    } catch (error) {
      if (error.statusCode === 404) {
        throw new NotFoundError(`No suggested order ${index} for analysis ${date}`);
      }
      throw error;
    }

    // Merge: only the status columns change; immutable order fields untouched.
    // Empty-string clears the note (Merge leaves omitted properties unchanged).
    await this._database.ordersClient.updateEntity(
      {
        partitionKey: id.partitionKey,
        rowKey: id.rowKey,
        executionStatus: status,
        executionNote: note ? String(note) : '',
        executionUpdatedAt: updatedAt,
      },
      'Merge'
    );

    return {
      date,
      index,
      executionStatus: status,
      executionNote: note ? String(note) : null,
      executionUpdatedAt: updatedAt,
    };
  }

  /**
   * Feature 007: true if any order for the date is non-pending (week frozen).
   * @param {string} date
   * @returns {Promise<boolean>}
   */
  async hasMarkedOrders(date) {
    await this._ensureInitialized();
    for await (const entity of this._database.ordersClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${date}'` },
    })) {
      if (entity.executionStatus && entity.executionStatus !== 'pending') {
        return true;
      }
    }
    return false;
  }

  /**
   * Feature 007: all orders across every analysis (for the scorecard). The
   * orders table is tiny (a handful per week), so a full scan is fine.
   * @returns {Promise<SuggestedOrder[]>}
   */
  async listAllOrders() {
    await this._ensureInitialized();
    const orders = [];
    for await (const entity of this._database.ordersClient.listEntities()) {
      orders.push(this._orderFromEntity(entity));
    }
    return orders;
  }

  // ==================== Mappers ====================

  _analysisToEntity(wa) {
    const id = WeeklyAnalysis.id(wa.date);
    const entity = {
      partitionKey: id.partitionKey,
      rowKey: id.rowKey,
      status: wa.status,
      generatedAt: wa.generatedAt instanceof Date ? wa.generatedAt.toISOString() : wa.generatedAt,
      modelUsed: wa.modelUsed,
      promptVersion: wa.promptVersion,
      summary: wa.summary || '',
      markdownBody: wa.markdownBody || '',
      riesgoPaisBp: wa.riesgoPaisBp,
      riesgoPaisAsOf: wa.riesgoPaisAsOf || '',
      portfolioSnapshotJson: JSON.stringify(wa.portfolioSnapshot || []),
      tokensIn: wa.tokensIn,
      tokensOut: wa.tokensOut,
      costUsd: wa.costUsd,
      durationMs: wa.durationMs,
      errorMessage: wa.errorMessage || '',
    };
    // Feature 005 (FR-012): only include the property when non-null. Older
    // rows simply lack it; Azure Tables tolerates the missing property on read.
    if (wa.instructionsHistoryRowKey) {
      entity.instructionsHistoryRowKey = wa.instructionsHistoryRowKey;
    }
    // Feature 004 (legacy): preserve the framework reference for pre-005 rows.
    if (wa.frameworkHistoryRowKey) {
      entity.frameworkHistoryRowKey = wa.frameworkHistoryRowKey;
    }
    // Feature 006: macro panel + portfolio totals + position changes, each as a
    // JSON column. Only written when present (pre-feature rows stay clean).
    if (wa.macroContext) {
      entity.macroContextJson = JSON.stringify(wa.macroContext);
    }
    if (wa.portfolioTotals) {
      entity.portfolioTotalsJson = JSON.stringify(wa.portfolioTotals);
    }
    // positionChanges: serialize the literal `null` (unknown) vs `[]` (no
    // change) so the distinction survives a round-trip. A MISSING column also
    // reads back as null. Only skip when the entity never computed it (null).
    if (wa.positionChanges !== null && wa.positionChanges !== undefined) {
      entity.positionChangesJson = JSON.stringify(wa.positionChanges);
    }
    // Feature 010: six optional structured sections, each as a JSON column.
    // Only written when non-null so pre-feature rows (and absent sections)
    // stay clean. A re-run upserts with 'Replace', so a section present last
    // week but null this week is dropped (FR-013) — the column simply isn't
    // written and reads back as null.
    if (wa.driftByBucket !== null && wa.driftByBucket !== undefined) {
      entity.driftByBucketJson = JSON.stringify(wa.driftByBucket);
    }
    if (wa.driftByAssetClass !== null && wa.driftByAssetClass !== undefined) {
      entity.driftByAssetClassJson = JSON.stringify(wa.driftByAssetClass);
    }
    if (wa.concentrationCaps !== null && wa.concentrationCaps !== undefined) {
      entity.concentrationCapsJson = JSON.stringify(wa.concentrationCaps);
    }
    if (wa.watchlist !== null && wa.watchlist !== undefined) {
      entity.watchlistJson = JSON.stringify(wa.watchlist);
    }
    if (wa.weekOverWeek !== null && wa.weekOverWeek !== undefined) {
      entity.weekOverWeekJson = JSON.stringify(wa.weekOverWeek);
    }
    if (wa.frameworkAmendments !== null && wa.frameworkAmendments !== undefined) {
      entity.frameworkAmendmentsJson = JSON.stringify(wa.frameworkAmendments);
    }
    // Feature 012: deterministic macro week-over-week comparison. Only written
    // when non-null; a re-run upserts with 'Replace', so a comparison present
    // last week but null this week is dropped (FR-012).
    if (wa.macroChanges !== null && wa.macroChanges !== undefined) {
      entity.macroChangesJson = JSON.stringify(wa.macroChanges);
    }
    return entity;
  }

  _analysisFromEntity(entity) {
    let portfolioSnapshot = [];
    if (entity.portfolioSnapshotJson) {
      try {
        portfolioSnapshot = JSON.parse(entity.portfolioSnapshotJson);
      } catch (parseErr) {
        logger.warn(`Could not parse portfolioSnapshotJson for ${entity.rowKey}`, parseErr);
        portfolioSnapshot = [];
      }
    }
    // Feature 006: parse the three JSON columns; absent column → null
    // (pre-feature rows). Malformed JSON → null with a warning.
    const macroContext = this._parseJsonColumn(entity.macroContextJson, entity.rowKey, 'macroContextJson', null);
    const portfolioTotals = this._parseJsonColumn(entity.portfolioTotalsJson, entity.rowKey, 'portfolioTotalsJson', null);
    // positionChanges: a stored literal "null" parses back to null (unknown);
    // "[]" parses to [] (no change); absent column → null.
    const positionChanges = entity.positionChangesJson !== undefined
      ? this._parseJsonColumn(entity.positionChangesJson, entity.rowKey, 'positionChangesJson', null)
      : null;
    // Feature 010: parse the six structured-section columns; absent → null
    // (pre-feature rows / sections not produced). Malformed JSON → null + warn.
    const driftByBucket = this._parseJsonColumn(entity.driftByBucketJson, entity.rowKey, 'driftByBucketJson', null);
    const driftByAssetClass = this._parseJsonColumn(entity.driftByAssetClassJson, entity.rowKey, 'driftByAssetClassJson', null);
    const concentrationCaps = this._parseJsonColumn(entity.concentrationCapsJson, entity.rowKey, 'concentrationCapsJson', null);
    const watchlist = this._parseJsonColumn(entity.watchlistJson, entity.rowKey, 'watchlistJson', null);
    const weekOverWeek = this._parseJsonColumn(entity.weekOverWeekJson, entity.rowKey, 'weekOverWeekJson', null);
    const frameworkAmendments = this._parseJsonColumn(entity.frameworkAmendmentsJson, entity.rowKey, 'frameworkAmendmentsJson', null);
    // Feature 012: macro week-over-week comparison (absent on pre-feature rows → null).
    const macroChanges = this._parseJsonColumn(entity.macroChangesJson, entity.rowKey, 'macroChangesJson', null);
    return new WeeklyAnalysis({
      date: entity.rowKey,
      status: entity.status,
      generatedAt: entity.generatedAt,
      modelUsed: entity.modelUsed,
      promptVersion: entity.promptVersion,
      summary: entity.summary || null,
      markdownBody: entity.markdownBody || null,
      riesgoPaisBp: entity.riesgoPaisBp !== undefined && entity.riesgoPaisBp !== '' ? entity.riesgoPaisBp : null,
      riesgoPaisAsOf: entity.riesgoPaisAsOf || null,
      portfolioSnapshot,
      tokensIn: entity.tokensIn || 0,
      tokensOut: entity.tokensOut || 0,
      costUsd: entity.costUsd || 0,
      durationMs: entity.durationMs || 0,
      errorMessage: entity.errorMessage || null,
      // Feature 005 (FR-012/FR-013): absent on pre-feature rows → null.
      instructionsHistoryRowKey: entity.instructionsHistoryRowKey || null,
      // Feature 004 (legacy): absent on pre-004 and post-005 rows → null.
      frameworkHistoryRowKey: entity.frameworkHistoryRowKey || null,
      // Feature 006: macro/totals/changes (absent on pre-feature rows → null).
      macroContext,
      portfolioTotals,
      positionChanges,
      // Feature 010: structured sections (absent on pre-feature rows → null).
      driftByBucket,
      driftByAssetClass,
      concentrationCaps,
      watchlist,
      weekOverWeek,
      frameworkAmendments,
      // Feature 012:
      macroChanges,
    });
  }

  /**
   * Parse a JSON-string column, returning `fallback` when absent and logging a
   * warning (then returning `fallback`) on malformed JSON. (Feature 006.)
   * @private
   */
  _parseJsonColumn(raw, rowKey, columnName, fallback) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      logger.warn(`Could not parse ${columnName} for ${rowKey}`, parseErr);
      return fallback;
    }
  }

  _orderToEntity(order) {
    const id = SuggestedOrder.id(order.analysisDate, order.index);
    const entity = {
      partitionKey: id.partitionKey,
      rowKey: id.rowKey,
      indexNum: order.index,
      broker: order.broker,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      rationale: order.rationale,
      conviction: order.conviction,
    };
    // Feature 007: execution status columns (only when set, to keep new rows clean).
    if (order.executionStatus && order.executionStatus !== 'pending') {
      entity.executionStatus = order.executionStatus;
    }
    if (order.executionNote) entity.executionNote = order.executionNote;
    if (order.executionUpdatedAt) entity.executionUpdatedAt = order.executionUpdatedAt;
    return entity;
  }

  _orderFromEntity(entity) {
    return new SuggestedOrder({
      analysisDate: entity.partitionKey,
      index: entity.indexNum !== undefined ? entity.indexNum : parseInt(entity.rowKey, 10),
      broker: entity.broker,
      symbol: entity.symbol,
      side: entity.side,
      quantity: entity.quantity,
      rationale: entity.rationale,
      conviction: entity.conviction,
      // Feature 007: absent on pre-feature rows → 'pending'/null.
      executionStatus: entity.executionStatus || 'pending',
      executionNote: entity.executionNote || null,
      executionUpdatedAt: entity.executionUpdatedAt || null,
    });
  }
}

module.exports = AzureAnalysisRepository;
