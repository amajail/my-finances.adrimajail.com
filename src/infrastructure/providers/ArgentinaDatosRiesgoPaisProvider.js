/**
 * Argentina Datos Riesgo País Provider
 *
 * Fetches the most-recent Argentina country-risk reading from
 * api.argentinadatos.com (public JSON, no auth). Used by feature 002
 * (weekly rebalance analysis) to surface the FR-013 trigger (riesgo país
 * > 600 bp) in each weekly run.
 *
 * Throws RiesgoPaisFetchError on timeout, non-2xx, or empty response so the
 * caller (GenerateWeeklyAnalysis) can persist a `failed` analysis row
 * instead of silently substituting a stale value (spec FR-005).
 */

const IRiesgoPaisProvider = require('../../application/interfaces/IRiesgoPaisProvider');

// IMPORTANT: use the `/ultimo` endpoint, NOT the bare `/riesgo-pais` endpoint.
// The bare endpoint returns the FULL history in chronological-ASC order, so
// `[0]` is the oldest reading (1999-era values like 937 bp) — exactly the
// opposite of what a "current riesgo país" reader expects. `/ultimo` returns
// a single object with the most recent reading.
const DEFAULT_BASE_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo';
const DEFAULT_TIMEOUT_MS = 10000;

class RiesgoPaisFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'RiesgoPaisFetchError';
    if (cause) this.cause = cause;
  }
}

class ArgentinaDatosRiesgoPaisProvider extends IRiesgoPaisProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.fetcher] - fetch-compatible function (defaults to global fetch).
   * @param {string}   [opts.url]     - Override endpoint URL (full path).
   * @param {number}   [opts.timeoutMs]
   */
  constructor({ fetcher, url = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._url = url;
    this._timeoutMs = timeoutMs;
  }

  /**
   * @returns {Promise<{ basisPoints: number, asOf: string }>}
   */
  async getLatest() {
    if (!this._fetcher) {
      throw new RiesgoPaisFetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let res;
    try {
      res = await this._fetcher(this._url, { signal: controller.signal });
    } catch (err) {
      throw new RiesgoPaisFetchError(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms`
          : `fetch failed: ${err && err.message ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new RiesgoPaisFetchError(
        `non-2xx response: ${res && res.status ? res.status : 'unknown'}`
      );
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new RiesgoPaisFetchError(`response was not valid JSON: ${err.message}`, err);
    }

    // `/ultimo` returns a single object `{ valor: number, fecha: "YYYY-MM-DD" }`.
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new RiesgoPaisFetchError('response was not a single object');
    }

    const valor = typeof body.valor !== 'undefined' ? Number(body.valor) : NaN;
    const fecha = typeof body.fecha === 'string' ? body.fecha : null;

    if (!Number.isFinite(valor) || valor < 0) {
      throw new RiesgoPaisFetchError('response has no valid `valor`');
    }
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new RiesgoPaisFetchError('response has no valid `fecha`');
    }

    return {
      basisPoints: Math.round(valor),
      asOf: fecha,
    };
  }
}

module.exports = ArgentinaDatosRiesgoPaisProvider;
module.exports.RiesgoPaisFetchError = RiesgoPaisFetchError;
