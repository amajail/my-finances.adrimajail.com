/**
 * DolarApi FX Gap Provider (feature 006)
 *
 * Fetches the official and MEP (dólar "bolsa") USD rates from dolarapi.com
 * (public JSON, no auth) and returns the gap %:
 *   gap = (bolsa.venta − oficial.venta) / oficial.venta × 100
 *
 * Throws FxGapFetchError on timeout, non-2xx, or malformed payload so the
 * MacroContextProvider can mark the reading `available:false`.
 */

const IFxGapProvider = require('../../application/interfaces/IFxGapProvider');

const DEFAULT_BASE_URL = 'https://dolarapi.com/v1/dolares';
const DEFAULT_TIMEOUT_MS = 10000;

class FxGapFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'FxGapFetchError';
    if (cause) this.cause = cause;
  }
}

class DolarApiFxGapProvider extends IFxGapProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.fetcher] - fetch-compatible function (defaults to global fetch).
   * @param {string}   [opts.baseUrl] - Override base URL.
   * @param {number}   [opts.timeoutMs]
   */
  constructor({ fetcher, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._timeoutMs = timeoutMs;
  }

  async getLatest() {
    if (!this._fetcher) {
      throw new FxGapFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const [oficial, bolsa] = await Promise.all([
      this._fetchOne('oficial'),
      this._fetchOne('bolsa'),
    ]);

    const oficialVenta = Number(oficial.venta);
    const bolsaVenta = Number(bolsa.venta);
    if (!Number.isFinite(oficialVenta) || oficialVenta <= 0) {
      throw new FxGapFetchError('oficial quote has no valid `venta`');
    }
    if (!Number.isFinite(bolsaVenta) || bolsaVenta <= 0) {
      throw new FxGapFetchError('bolsa quote has no valid `venta`');
    }

    const gapPct = Number((((bolsaVenta - oficialVenta) / oficialVenta) * 100).toFixed(2));
    const asOf = this._latestAsOf(oficial.fechaActualizacion, bolsa.fechaActualizacion);

    return { gapPct, asOf };
  }

  async _fetchOne(casa) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    let res;
    try {
      res = await this._fetcher(`${this._baseUrl}/${casa}`, { signal: controller.signal });
    } catch (err) {
      throw new FxGapFetchError(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms fetching ${casa}`
          : `fetch failed for ${casa}: ${err && err.message ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new FxGapFetchError(`non-2xx response for ${casa}: ${res && res.status ? res.status : 'unknown'}`);
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new FxGapFetchError(`response for ${casa} was not valid JSON: ${err.message}`, err);
    }
    if (!body || typeof body !== 'object') {
      throw new FxGapFetchError(`response for ${casa} was not an object`);
    }
    return body;
  }

  _latestAsOf(a, b) {
    const toDate = (s) => (typeof s === 'string' && s.length >= 10 ? s.slice(0, 10) : null);
    const da = toDate(a);
    const db = toDate(b);
    if (da && db) return da >= db ? da : db;
    return da || db || null;
  }
}

module.exports = DolarApiFxGapProvider;
module.exports.FxGapFetchError = FxGapFetchError;
