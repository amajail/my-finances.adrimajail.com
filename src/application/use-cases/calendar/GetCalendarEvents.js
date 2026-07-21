/**
 * GetCalendarEvents Use Case
 *
 * Feature 017: read-only computation of the dividend & maturity calendar.
 * Orchestrates: portfolio snapshot (reuses GetPortfolioSummary so amounts
 * always agree with the rest of the app, research D3) → dividend facts
 * (optional provider — absent or failing provider degrades to maturities
 * only, FR-007) → CalendarEventBuilder → ordered event feed.
 *
 * No persistence, no mutation (FR-006). No caching in v1 (research D4).
 */

const UseCase = require('../UseCase');
const CalendarEventBuilder = require('../../../domain/services/CalendarEventBuilder');
const { ValidationError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

const DEFAULT_HORIZON_DAYS = 180;
const MAX_HORIZON_DAYS = 400;
const DIVIDEND_ELIGIBLE_TYPES = ['stock', 'etf', 'cedear'];

class GetCalendarEvents extends UseCase {
  /**
   * @param {Object} deps
   * @param {Object} deps.getPortfolioSummary - GetPortfolioSummary instance
   * @param {IDividendEventsProvider|null} [deps.dividendEventsProvider]
   * @param {Function} [deps.clock] - () => Date, injectable for tests
   */
  constructor({ getPortfolioSummary, dividendEventsProvider = null, clock = () => new Date() }) {
    super();
    this._getPortfolioSummary = getPortfolioSummary;
    this._dividendEventsProvider = dividendEventsProvider;
    this._clock = clock;
  }

  /**
   * @param {Object} [input]
   * @param {number|string} [input.days] - horizon, 1..400, default 180
   */
  async execute(input = {}) {
    const horizonDays = this._parseHorizon(input.days);
    const today = this._clock();

    const summary = await this._getPortfolioSummary.execute({});
    const positions = Array.isArray(summary.positions)
      ? summary.positions.filter((p) => (p.status || 'open') !== 'closed')
      : [];

    let dividendFacts = [];
    let dividendSourceAvailable = true;
    if (this._dividendEventsProvider) {
      const eligible = positions.filter((p) => DIVIDEND_ELIGIBLE_TYPES.includes(p.assetType));
      try {
        const result = await this._dividendEventsProvider.getUpcomingDividends(eligible);
        dividendFacts = result.facts || [];
        dividendSourceAvailable = result.sourceAvailable !== false;
      } catch (err) {
        // Contract says providers never reject, but the calendar must not
        // break even if one does (FR-007). Metadata-only log.
        logger.warn('Dividend provider threw; degrading to maturities only', { errorType: err && err.name });
        dividendSourceAvailable = false;
      }
    } else {
      dividendSourceAvailable = false;
    }

    const { events, fixedIncomeWithoutMaturity } = CalendarEventBuilder.build({
      positions,
      dividendFacts,
      horizonDays,
      today,
    });

    return {
      horizonDays,
      generatedAt: today.toISOString(),
      dividendSourceAvailable,
      fixedIncomeWithoutMaturity,
      events,
      months: this._monthGroups(events),
    };
  }

  _parseHorizon(days) {
    if (days === undefined || days === null || days === '') return DEFAULT_HORIZON_DAYS;
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > MAX_HORIZON_DAYS) {
      throw new ValidationError(`days must be an integer between 1 and ${MAX_HORIZON_DAYS}`, [
        { field: 'days', message: `must be an integer between 1 and ${MAX_HORIZON_DAYS}` },
      ]);
    }
    return n;
  }

  /**
   * FR-010: per-month estimated USD subtotals; events without a USD estimate
   * are excluded from the total and counted.
   */
  _monthGroups(events) {
    const byMonth = new Map();
    for (const e of events) {
      const month = e.date.slice(0, 7);
      if (!byMonth.has(month)) {
        byMonth.set(month, { month, totalUsd: 0, excludedFromTotal: 0, eventCount: 0 });
      }
      const g = byMonth.get(month);
      g.eventCount += 1;
      if (Number.isFinite(e.amountUsd)) {
        g.totalUsd += e.amountUsd;
      } else {
        g.excludedFromTotal += 1;
      }
    }
    return Array.from(byMonth.values())
      .map((g) => ({ ...g, totalUsd: Math.round(g.totalUsd * 100) / 100 }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
  }
}

module.exports = GetCalendarEvents;
