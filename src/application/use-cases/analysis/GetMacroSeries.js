/**
 * GetMacroSeries Use Case (feature 008)
 *
 * Projects the persisted per-analysis macro panel + portfolio totals (feature 006)
 * across analyses into a time-ordered series for the charts page. Pure read — no
 * new storage, no new repository method (getLatest already returns macroContext +
 * portfolioTotals on each WeeklyAnalysis).
 *
 * Returns points ASCENDING by date (chart-ready). Analyses lacking macro/totals
 * contribute a point with null fields; the client simply finds no value there.
 */

const UseCase = require('../UseCase');
const EarmarkedTotals = require('../../../domain/services/EarmarkedTotals');

const DEFAULT_WEEKS = 60;
const MAX_WEEKS = 200;

class GetMacroSeries extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAnalysisRepository} deps.analysisRepository
   */
  constructor({ analysisRepository }) {
    super();
    this._analysisRepository = analysisRepository;
  }

  /**
   * @param {Object} [input]
   * @param {number|string} [input.weeks] - max most-recent analyses (clamped 1..200).
   * @returns {Promise<{ points: Array<{date:string, macroContext:object|null, portfolioTotals:object|null}>, count: number }>}
   */
  async execute({ weeks } = {}) {
    const n = parseInt(weeks, 10);
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(MAX_WEEKS, n)) : DEFAULT_WEEKS;

    const analyses = await this._analysisRepository.getLatest(limit); // newest-first
    const points = (analyses || [])
      .map((a) => ({
        date: a.date,
        macroContext: a.macroContext || null,
        // Feature 019 follow-up: augment (never replace) the persisted totals
        // with the investable ex-earmarked split, so the charted portfolio line
        // stays continuous across the run where the reserve was first priced.
        portfolioTotals: EarmarkedTotals.split(a.portfolioTotals || null, a.earmarkedPositions),
      }))
      .sort((x, y) => x.date.localeCompare(y.date)); // ascending for charts

    return { points, count: points.length };
  }
}

module.exports = GetMacroSeries;
