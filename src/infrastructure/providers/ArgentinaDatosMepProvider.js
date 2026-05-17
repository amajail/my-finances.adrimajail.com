/**
 * Argentina Datos MEP Provider
 *
 * Fetches the most-recent dólar bolsa (MEP) rate from
 * api.argentinadatos.com. Replaces the static `mep_rate` portfolioSettings
 * row.
 *
 * The endpoint pattern is `/v1/cotizaciones/dolares/{casa}/{YYYY}/{MM}/{DD}`
 * (slash-separated date segments, not hyphenated). For `casa=bolsa` (MEP)
 * the response is a single object:
 *
 *   { "casa": "bolsa", "compra": 1418.8, "venta": 1431.4, "fecha": "2026-05-14" }
 *
 * We return `venta` (the sell side) as the rate — this is the conventional
 * "MEP rate" used in Argentine portfolio valuation.
 *
 * NOTE: there is no `/ultimo` variant for this endpoint (unlike riesgo país),
 * so we step backwards from today by up to MAX_LOOKBACK_DAYS until we find a
 * day with a published quote (markets close weekends + holidays).
 */

const IMepProvider = require('../../application/interfaces/IMepProvider');

const DEFAULT_BASE = 'https://api.argentinadatos.com/v1/cotizaciones/dolares';
const DEFAULT_CASA = 'bolsa';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_LOOKBACK_DAYS = 5;

class MepFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'MepFetchError';
    if (cause) this.cause = cause;
  }
}

class ArgentinaDatosMepProvider extends IMepProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.fetcher]   - fetch-compatible (defaults to global fetch).
   * @param {string}   [opts.baseUrl]   - Override base path (no trailing slash).
   * @param {string}   [opts.casa]      - 'bolsa' (MEP) by default.
   * @param {number}   [opts.timeoutMs]
   * @param {Function} [opts.clock]     - () => Date (injectable for tests).
   */
  constructor({
    fetcher,
    baseUrl = DEFAULT_BASE,
    casa = DEFAULT_CASA,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    clock = () => new Date(),
  } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._casa = casa;
    this._timeoutMs = timeoutMs;
    this._clock = clock;
  }

  /**
   * @returns {Promise<{ rate: number, asOf: string }>}
   */
  async getLatest() {
    if (!this._fetcher) {
      throw new MepFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const today = this._clock();
    const errors = [];
    for (let daysBack = 0; daysBack <= MAX_LOOKBACK_DAYS; daysBack++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - daysBack);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const url = `${this._baseUrl}/${encodeURIComponent(this._casa)}/${yyyy}/${mm}/${dd}`;

      try {
        const reading = await this._tryOne(url);
        if (reading) return reading;
      } catch (err) {
        errors.push(`${yyyy}-${mm}-${dd}: ${err.message}`);
      }
    }

    throw new MepFetchError(
      `no MEP quote found within ${MAX_LOOKBACK_DAYS + 1} day(s): ${errors.join('; ')}`
    );
  }

  async _tryOne(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let res;
    try {
      res = await this._fetcher(url, { signal: controller.signal });
    } catch (err) {
      throw err.name === 'AbortError'
        ? new MepFetchError(`timeout after ${this._timeoutMs}ms`)
        : new MepFetchError(`fetch failed: ${err.message || err}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res || !res.ok) {
      // 404 on a particular date is expected (no quote published); the caller
      // will try the prior day. Other non-2xx are also non-fatal here.
      return null;
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new MepFetchError(`response was not valid JSON: ${err.message}`);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new MepFetchError('response was not a single object');
    }

    const venta = typeof body.venta !== 'undefined' ? Number(body.venta) : NaN;
    const fecha = typeof body.fecha === 'string' ? body.fecha : null;
    if (!Number.isFinite(venta) || venta <= 0) {
      throw new MepFetchError('response has no valid `venta`');
    }
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new MepFetchError('response has no valid `fecha`');
    }

    return { rate: venta, asOf: fecha };
  }
}

module.exports = ArgentinaDatosMepProvider;
module.exports.MepFetchError = MepFetchError;
