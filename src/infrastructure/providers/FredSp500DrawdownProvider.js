/**
 * FRED S&P 500 Drawdown Provider (feature 006)
 *
 * Computes the S&P 500 drawdown from its high using the FRED `SP500` series
 * (daily close). Used in place of the keyless Stooq CSV when Stooq gates the
 * endpoint behind a browser challenge (its keyless CSV is unreliable for
 * headless callers). Requires the same free FRED API key as FredProvider.
 *
 * Caveat (documented in research.md): FRED's `SP500` retains only ~10 years of
 * daily history, so the "high" is a ~10-year high, not guaranteed the true ATH.
 * In practice (index near record levels) this matches the true ATH.
 *
 * Throws FredConfigError when the key is missing, FredFetchError on HTTP failure.
 */

const ISp500DrawdownProvider = require('../../application/interfaces/ISp500DrawdownProvider');
const { FredConfigError, FredFetchError } = require('./FredProvider');

const DEFAULT_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const DEFAULT_TIMEOUT_MS = 10000;
const SERIES_ID = 'SP500';

class FredSp500DrawdownProvider extends ISp500DrawdownProvider {
  /**
   * @param {Object} [opts]
   * @param {string}   [opts.apiKey]
   * @param {Function} [opts.fetcher]
   * @param {string}   [opts.baseUrl]
   * @param {number}   [opts.timeoutMs]
   */
  constructor({ apiKey = null, fetcher, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._apiKey = apiKey || null;
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._baseUrl = baseUrl;
    this._timeoutMs = timeoutMs;
  }

  async getLatest() {
    if (!this._apiKey) {
      throw new FredConfigError('FRED API key not configured (set analysis.fredApiKey)');
    }
    if (!this._fetcher) {
      throw new FredFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const params = new URLSearchParams({
      series_id: SERIES_ID,
      api_key: this._apiKey,
      file_type: 'json',
      sort_order: 'asc',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    let res;
    try {
      res = await this._fetcher(`${this._baseUrl}?${params.toString()}`, { signal: controller.signal });
    } catch (err) {
      throw new FredFetchError(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms`
          : `fetch failed: ${err && err.message ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new FredFetchError(`non-2xx response: ${res && res.status ? res.status : 'unknown'}`);
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new FredFetchError(`response was not valid JSON: ${err.message}`, err);
    }

    const obs = body && Array.isArray(body.observations) ? body.observations : null;
    if (!obs || obs.length === 0) {
      throw new FredFetchError('no SP500 observations returned');
    }

    let maxClose = -Infinity;
    let lastClose = NaN;
    let lastDate = null;
    for (const o of obs) {
      if (!o || o.value === '.' || o.value === undefined) continue; // FRED missing marker
      const close = Number(o.value);
      if (!Number.isFinite(close)) continue;
      if (close > maxClose) maxClose = close;
      lastClose = close;
      lastDate = typeof o.date === 'string' ? o.date : lastDate;
    }

    if (!Number.isFinite(lastClose) || !Number.isFinite(maxClose) || maxClose <= 0) {
      throw new FredFetchError('SP500 series had no usable close values');
    }
    if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
      throw new FredFetchError('SP500 series has no valid latest date');
    }

    const drawdownPct = Number((((lastClose - maxClose) / maxClose) * 100).toFixed(2));
    return { drawdownPct, asOf: lastDate };
  }
}

module.exports = FredSp500DrawdownProvider;
