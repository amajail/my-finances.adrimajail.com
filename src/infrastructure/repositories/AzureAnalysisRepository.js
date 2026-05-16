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

  // ==================== Mappers ====================

  _analysisToEntity(wa) {
    const id = WeeklyAnalysis.id(wa.date);
    return {
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
    });
  }

  _orderToEntity(order) {
    const id = SuggestedOrder.id(order.analysisDate, order.index);
    return {
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
    });
  }
}

module.exports = AzureAnalysisRepository;
