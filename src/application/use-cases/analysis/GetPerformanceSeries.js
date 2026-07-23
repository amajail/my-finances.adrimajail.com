/**
 * GetPerformanceSeries Use Case (feature 009)
 *
 * Builds the weekly performance series for the charts page: the portfolio total
 * value + MEP from the persisted weekly totals (feature 006), and the S&P 500 /
 * US CPI / Argentina CPI **levels** fetched server-side on-demand and aligned
 * on/before each analysis date. Returns ascending by date. No new storage.
 *
 * Resilient: each benchmark fetch is independent; a failure (or missing FRED key)
 * marks that benchmark unavailable for all dates while the portfolio + MEP — and
 * the other benchmarks — still return. The FRED key never leaves the server.
 */

const UseCase = require('../UseCase');
const BenchmarkAligner = require('../../../domain/services/BenchmarkAligner');
const EarmarkedTotals = require('../../../domain/services/EarmarkedTotals');
const ArCpiIndex = require('../../../domain/services/ArCpiIndex');
const logger = require('../../../shared/logging');

const DEFAULT_WEEKS = 60;
const MAX_WEEKS = 200;
const FETCH_BUFFER_DAYS = 90; // look back so monthly CPI / weekend S&P has an on/before level

function minusDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

class GetPerformanceSeries extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAnalysisRepository} deps.analysisRepository
   * @param {Object} deps.fredProvider - getObservations(seriesId, {start,end})
   * @param {Object} deps.inflationProvider - getSeries() → [{date, percent}]
   */
  constructor({ analysisRepository, fredProvider, inflationProvider }) {
    super();
    this._analysisRepository = analysisRepository;
    this._fredProvider = fredProvider;
    this._inflationProvider = inflationProvider;
  }

  async execute({ weeks } = {}) {
    const n = parseInt(weeks, 10);
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(MAX_WEEKS, n)) : DEFAULT_WEEKS;

    const analyses = await this._analysisRepository.getLatest(limit); // newest-first
    const base = (analyses || [])
      .map((a) => {
        // The portfolio line is investable capital, EXCLUDING the earmarked
        // reserve (feature 019 follow-up): a static reserve both dilutes the
        // benchmark comparison and — because it only started carrying a market
        // value once it was priced — would inject a one-off step that is not a
        // real gain. Rows written before that carry no earmarked positions, so
        // investableTotalUsd === grandTotalUsd and history is unaffected.
        const t = EarmarkedTotals.split(a.portfolioTotals || null, a.earmarkedPositions);
        const mepVal = t && Number.isFinite(Number(t.mepRate)) ? Number(t.mepRate) : null;
        return {
          date: a.date,
          portfolioValueUsd: t && Number.isFinite(Number(t.investableTotalUsd)) ? Number(t.investableTotalUsd) : null,
          mep: { value: mepVal, asOf: t ? t.mepRateAsOf || a.date : null, available: mepVal !== null },
        };
      })
      .sort((x, y) => x.date.localeCompare(y.date)); // ascending

    const dates = base.map((p) => p.date);
    const gaps = dates.map((date) => ({ date, value: null, asOf: null, available: false }));

    // No dates → return empty cleanly (benchmarks all unavailable).
    if (dates.length === 0) {
      return { points: [], count: 0, benchmarksAvailable: { mep: false, sp500: false, usCpi: false, arCpi: false } };
    }

    const start = minusDays(dates[0], FETCH_BUFFER_DAYS);
    const end = dates[dates.length - 1];

    const align = async (fetchFn) => {
      const observations = await fetchFn();
      return BenchmarkAligner.alignOnOrBefore(observations, dates);
    };

    const [sp500R, usCpiR, arCpiR] = await Promise.allSettled([
      align(() => this._fredProvider.getObservations('SP500', { start, end })),
      align(() => this._fredProvider.getObservations('CPIAUCSL', { start, end })),
      align(async () => ArCpiIndex.build(await this._inflationProvider.getSeries())),
    ]);

    const settled = (r, name) => {
      if (r.status === 'fulfilled') return r.value;
      logger.warn(`GetPerformanceSeries: ${name} benchmark unavailable`, { errorType: r.reason && r.reason.name });
      return gaps;
    };
    const sp500 = settled(sp500R, 'sp500');
    const usCpi = settled(usCpiR, 'usCpi');
    const arCpi = settled(arCpiR, 'arCpi');

    const points = base.map((p, i) => ({
      date: p.date,
      portfolioValueUsd: p.portfolioValueUsd,
      mep: p.mep,
      sp500: sp500[i],
      usCpi: usCpi[i],
      arCpi: arCpi[i],
    }));

    const anyAvailable = (arr) => arr.some((x) => x.available);
    return {
      points,
      count: points.length,
      benchmarksAvailable: {
        mep: base.some((p) => p.mep.available),
        sp500: anyAvailable(sp500),
        usCpi: anyAvailable(usCpi),
        arCpi: anyAvailable(arCpi),
      },
    };
  }
}

module.exports = GetPerformanceSeries;
