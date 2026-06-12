/**
 * FRED Provider (feature 006)
 *
 * Generic client for the FRED observations API (St. Louis Fed). Serves the
 * US/global series:
 *   - CPIAUCSL with units=pc1 → US CPI year-over-year %.
 *   - DFEDTARU              → Fed funds target range upper limit (%).
 *
 * Requires a free FRED API key (supplied at construction from settings). When
 * the key is missing it throws FredConfigError (distinct from a fetch failure)
 * so the MacroContextProvider can mark FRED-backed indicators `available:false`
 * without treating it as an outage.
 */

const IFredProvider = require('../../application/interfaces/IFredProvider');

const DEFAULT_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const DEFAULT_TIMEOUT_MS = 10000;

class FredConfigError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'FredConfigError';
  }
}

class FredFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'FredFetchError';
    if (cause) this.cause = cause;
  }
}

class FredProvider extends IFredProvider {
  /**
   * @param {Object} [opts]
   * @param {string}   [opts.apiKey] - Free FRED API key (from analysis.fredApiKey).
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

  /**
   * @param {string} seriesId
   * @param {Object} [opts]
   * @param {string} [opts.units] - FRED units transform (e.g. 'pc1').
   * @returns {Promise<{ value: number, asOf: string }>}
   */
  async getLatestObservation(seriesId, { units } = {}) {
    if (!this._apiKey) {
      throw new FredConfigError('FRED API key not configured (set analysis.fredApiKey)');
    }
    if (!this._fetcher) {
      throw new FredFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this._apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit: '1',
    });
    if (units) params.set('units', units);

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
      throw new FredFetchError(`no observations for series ${seriesId}`);
    }
    // With sort_order=desc&limit=1, the first (and only) row is the newest with
    // a value; FRED missing values are the string ".".
    const latest = obs[0];
    if (!latest || latest.value === '.' ) {
      throw new FredFetchError(`latest observation for ${seriesId} has no value`);
    }
    const value = Number(latest.value);
    const asOf = typeof latest.date === 'string' ? latest.date : null;
    if (!Number.isFinite(value)) {
      throw new FredFetchError(`observation for ${seriesId} has a non-numeric value`);
    }
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new FredFetchError(`observation for ${seriesId} has no valid date`);
    }

    return { value, asOf };
  }
}

module.exports = FredProvider;
module.exports.FredConfigError = FredConfigError;
module.exports.FredFetchError = FredFetchError;
