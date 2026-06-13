/**
 * Argentina Datos Inflation Provider (feature 006)
 *
 * Fetches the latest Argentina monthly CPI (% change) from
 * api.argentinadatos.com (public JSON, no auth). The endpoint returns the full
 * monthly series ascending; we take the most recent month-end entry.
 *
 * Throws InflationFetchError on timeout, non-2xx, or empty/malformed payload.
 */

const IInflationProvider = require('../../application/interfaces/IInflationProvider');

const DEFAULT_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
const DEFAULT_TIMEOUT_MS = 10000;

class InflationFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'InflationFetchError';
    if (cause) this.cause = cause;
  }
}

class ArgentinaDatosInflationProvider extends IInflationProvider {
  constructor({ fetcher, url = DEFAULT_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._url = url;
    this._timeoutMs = timeoutMs;
  }

  async getLatest() {
    if (!this._fetcher) {
      throw new InflationFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let res;
    try {
      res = await this._fetcher(this._url, { signal: controller.signal });
    } catch (err) {
      throw new InflationFetchError(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms`
          : `fetch failed: ${err && err.message ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new InflationFetchError(`non-2xx response: ${res && res.status ? res.status : 'unknown'}`);
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new InflationFetchError(`response was not valid JSON: ${err.message}`, err);
    }

    if (!Array.isArray(body) || body.length === 0) {
      throw new InflationFetchError('response was not a non-empty array');
    }
    // Series is ascending by date; pick the entry with the max fecha.
    const latest = body.reduce((acc, cur) =>
      (acc && acc.fecha >= cur.fecha ? acc : cur), null);

    const percent = Number(latest.valor);
    const asOf = typeof latest.fecha === 'string' ? latest.fecha : null;
    if (!Number.isFinite(percent)) {
      throw new InflationFetchError('latest entry has no valid `valor`');
    }
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new InflationFetchError('latest entry has no valid `fecha`');
    }

    return { percent, asOf };
  }

  /**
   * Feature 009: the full monthly CPI series, ascending by date.
   * @returns {Promise<Array<{ date: string, percent: number }>>}
   */
  async getSeries() {
    if (!this._fetcher) {
      throw new InflationFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    let res;
    try {
      res = await this._fetcher(this._url, { signal: controller.signal });
    } catch (err) {
      throw new InflationFetchError(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms`
          : `fetch failed: ${err && err.message ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new InflationFetchError(`non-2xx response: ${res && res.status ? res.status : 'unknown'}`);
    }
    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new InflationFetchError(`response was not valid JSON: ${err.message}`, err);
    }
    if (!Array.isArray(body)) {
      throw new InflationFetchError('response was not an array');
    }
    return body
      .filter((e) => e && typeof e.fecha === 'string' && Number.isFinite(Number(e.valor)))
      .map((e) => ({ date: e.fecha, percent: Number(e.valor) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

module.exports = ArgentinaDatosInflationProvider;
module.exports.InflationFetchError = InflationFetchError;
