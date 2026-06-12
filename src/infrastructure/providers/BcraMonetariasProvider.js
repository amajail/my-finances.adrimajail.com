/**
 * BCRA Monetarias Provider (feature 006)
 *
 * Generic client for BCRA's "Principales Variables Monetarias" v4.0 API
 * (api.bcra.gob.ar, public, no auth). Serves multiple indicators by variable id:
 *   - idVariable 1   → International reserves, USD millions (GROSS).
 *   - idVariable 160 → Monetary policy / reference rate (nominal annual %).
 *
 * IMPORTANT: the API is v4.0; v3.0 returns HTTP 410 Gone. Observations are
 * nested under `results[0].detalle:[{fecha, valor}]`, newest first.
 *
 * Throws BcraFetchError on timeout, non-2xx, or malformed payload.
 */

const IBcraMonetariasProvider = require('../../application/interfaces/IBcraMonetariasProvider');

const DEFAULT_BASE_URL = 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias';
const DEFAULT_TIMEOUT_MS = 10000;

class BcraFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'BcraFetchError';
    if (cause) this.cause = cause;
  }
}

class BcraMonetariasProvider extends IBcraMonetariasProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.fetcher]
   * @param {string}   [opts.baseUrl]
   * @param {number}   [opts.timeoutMs]
   */
  constructor({ fetcher, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._timeoutMs = timeoutMs;
  }

  /**
   * @param {number} idVariable
   * @returns {Promise<{ value: number, asOf: string }>}
   */
  async getVariable(idVariable) {
    if (!this._fetcher) {
      throw new BcraFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let res;
    try {
      // limit=1 + desc: only the newest observation is needed.
      res = await this._fetcher(`${this._baseUrl}/${idVariable}?limit=1`, { signal: controller.signal });
    } catch (err) {
      throw new BcraFetchError(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms`
          : `fetch failed: ${err && err.message ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new BcraFetchError(`non-2xx response: ${res && res.status ? res.status : 'unknown'}`);
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new BcraFetchError(`response was not valid JSON: ${err.message}`, err);
    }

    const results = body && Array.isArray(body.results) ? body.results : null;
    const detalle = results && results[0] && Array.isArray(results[0].detalle) ? results[0].detalle : null;
    if (!detalle || detalle.length === 0) {
      throw new BcraFetchError(`no observations for idVariable ${idVariable}`);
    }
    // Newest first; defend against ordering by picking the max fecha.
    const latest = detalle.reduce((acc, cur) =>
      (acc && acc.fecha >= cur.fecha ? acc : cur), null);

    const value = Number(latest.valor);
    const asOf = typeof latest.fecha === 'string' ? latest.fecha : null;
    if (!Number.isFinite(value)) {
      throw new BcraFetchError(`observation for idVariable ${idVariable} has no valid \`valor\``);
    }
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new BcraFetchError(`observation for idVariable ${idVariable} has no valid \`fecha\``);
    }

    return { value, asOf };
  }
}

module.exports = BcraMonetariasProvider;
module.exports.BcraFetchError = BcraFetchError;
