/**
 * GetSuggestionScorecard Use Case (feature 007)
 *
 * Aggregates suggested-order execution outcomes across all analyses, overall and
 * by conviction. Execution rate = executed / (executed + partial + skipped);
 * pending orders are excluded from the rate. No outcome P&L (deferred follow-up).
 *
 * `sufficientData` is false until at least 3 completed analyses contribute (FR-013).
 */

const UseCase = require('../UseCase');

const CONVICTIONS = ['high', 'medium', 'low'];
const MIN_ANALYSES = 3;

function emptyBucket() {
  return { total: 0, executed: 0, partial: 0, skipped: 0, pending: 0, executionRate: 0 };
}

function rate(b) {
  const acted = b.executed + b.partial + b.skipped;
  return acted > 0 ? Number((b.executed / acted).toFixed(4)) : 0;
}

class GetSuggestionScorecard extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAnalysisRepository} deps.analysisRepository
   */
  constructor({ analysisRepository }) {
    super();
    this._analysisRepository = analysisRepository;
  }

  async execute() {
    const orders = await this._analysisRepository.listAllOrders();

    const overall = emptyBucket();
    const byConviction = {
      high: emptyBucket(),
      medium: emptyBucket(),
      low: emptyBucket(),
    };
    const dates = new Set();

    for (const o of orders) {
      const status = o.executionStatus || 'pending';
      const conviction = CONVICTIONS.includes(o.conviction) ? o.conviction : null;
      dates.add(o.analysisDate);

      overall.total += 1;
      if (overall[status] !== undefined) overall[status] += 1;
      if (conviction) {
        const b = byConviction[conviction];
        b.total += 1;
        if (b[status] !== undefined) b[status] += 1;
      }
    }

    overall.executionRate = rate(overall);
    for (const c of CONVICTIONS) byConviction[c].executionRate = rate(byConviction[c]);

    const analysesCount = dates.size;
    return {
      overall,
      byConviction,
      analysesCount,
      sufficientData: analysesCount >= MIN_ANALYSES,
    };
  }
}

module.exports = GetSuggestionScorecard;
