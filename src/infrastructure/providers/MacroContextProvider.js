/**
 * Macro Context Provider — orchestrator (feature 006)
 *
 * Fans out to the per-source providers via Promise.allSettled and assembles the
 * 9-indicator macro panel. NEVER throws: a source that fails (or whose key is
 * missing) becomes an `available:false` reading; the others still populate
 * (FR-004). Aggregates the IMF classify usage so the use-case can fold it into
 * run telemetry and the cost cap (FR-022).
 *
 * Resilience lives here, not in the individual providers — each provider throws
 * a typed error on failure; this orchestrator catches and maps.
 */

const IMacroContextProvider = require('../../application/interfaces/IMacroContextProvider');

const RESERVES_VARIABLE = 1;     // BCRA: international reserves (USD millions, GROSS)
const POLICY_RATE_VARIABLE = 160; // BCRA: monetary policy / reference rate (%)
const US_CPI_SERIES = 'CPIAUCSL'; // FRED: CPI index; units=pc1 → YoY %
const US_RATE_SERIES = 'DFEDTARU'; // FRED: Fed funds target upper limit (%)

function unavailable() {
  return { value: null, asOf: null, available: false };
}

class MacroContextProvider extends IMacroContextProvider {
  /**
   * @param {Object} deps
   * @param {Object} deps.riesgoPaisProvider  - getLatest() → { basisPoints, asOf }
   * @param {Object} deps.fxGapProvider        - getLatest() → { gapPct, asOf }
   * @param {Object} deps.bcraProvider         - getVariable(id) → { value, asOf }
   * @param {Object} deps.inflationProvider    - getLatest() → { percent, asOf }
   * @param {Object} deps.fredProvider         - getLatestObservation(series, {units}) → { value, asOf }
   * @param {Object} deps.sp500Provider        - getLatest() → { drawdownPct, asOf }
   * @param {Object} deps.imfStatusProvider    - getLatest({priorReading}) → { status, asOf, usage }
   */
  constructor({ riesgoPaisProvider, fxGapProvider, bcraProvider, inflationProvider, fredProvider, sp500Provider, imfStatusProvider }) {
    super();
    this._riesgoPaisProvider = riesgoPaisProvider;
    this._fxGapProvider = fxGapProvider;
    this._bcraProvider = bcraProvider;
    this._inflationProvider = inflationProvider;
    this._fredProvider = fredProvider;
    this._sp500Provider = sp500Provider;
    this._imfStatusProvider = imfStatusProvider;
  }

  async getLatest({ priorImfReading = null } = {}) {
    let imfUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

    const tasks = {
      riesgoPais: async () => {
        const r = await this._riesgoPaisProvider.getLatest();
        return { value: r.basisPoints, asOf: r.asOf, available: true };
      },
      fxGap: async () => {
        const r = await this._fxGapProvider.getLatest();
        return { value: r.gapPct, asOf: r.asOf, available: true };
      },
      bcraReserves: async () => {
        const r = await this._bcraProvider.getVariable(RESERVES_VARIABLE);
        // No public NET-reserves source exists; this is GROSS, explicitly labeled (FR-008).
        return { value: r.value, asOf: r.asOf, available: true, basis: 'gross' };
      },
      argInflation: async () => {
        const r = await this._inflationProvider.getLatest();
        return { value: r.percent, asOf: r.asOf, available: true };
      },
      argInterestRate: async () => {
        const r = await this._bcraProvider.getVariable(POLICY_RATE_VARIABLE);
        return { value: r.value, asOf: r.asOf, available: true };
      },
      usaInflation: async () => {
        const r = await this._fredProvider.getLatestObservation(US_CPI_SERIES, { units: 'pc1' });
        return { value: r.value, asOf: r.asOf, available: true };
      },
      usaInterestRate: async () => {
        const r = await this._fredProvider.getLatestObservation(US_RATE_SERIES);
        return { value: r.value, asOf: r.asOf, available: true };
      },
      sp500Drawdown: async () => {
        const r = await this._sp500Provider.getLatest();
        return { value: r.drawdownPct, asOf: r.asOf, available: true };
      },
      imfReviewStatus: async () => {
        const r = await this._imfStatusProvider.getLatest({ priorReading: priorImfReading });
        if (r.usage) imfUsage = r.usage;
        return { value: r.status, asOf: r.asOf, available: true };
      },
    };

    const keys = Object.keys(tasks);
    const settled = await Promise.allSettled(keys.map((k) => tasks[k]()));

    const readings = {};
    keys.forEach((key, i) => {
      const outcome = settled[i];
      readings[key] = outcome.status === 'fulfilled' ? outcome.value : unavailable();
    });

    return { readings, usage: imfUsage };
  }
}

module.exports = MacroContextProvider;
