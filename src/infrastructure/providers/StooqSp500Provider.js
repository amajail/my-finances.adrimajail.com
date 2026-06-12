/**
 * Stooq S&P 500 Drawdown Provider (feature 006)
 *
 * Fetches the S&P 500 daily price history from Stooq (keyless CSV) and computes
 * the current drawdown from the all-time high:
 *   drawdown = (lastClose − max(Close)) / max(Close) × 100   (≤ 0)
 *
 * Stooq's deep history yields a TRUE all-time high (unlike FRED's ~10yr window).
 * Throws Sp500FetchError on timeout, non-2xx, or unparseable CSV.
 */

const ISp500DrawdownProvider = require('../../application/interfaces/ISp500DrawdownProvider');

// `%5Espx` is the URL-encoded `^spx` (S&P 500 index); `i=d` = daily.
const DEFAULT_URL = 'https://stooq.com/q/d/l/?s=%5Espx&i=d';
const DEFAULT_TIMEOUT_MS = 10000;

class Sp500FetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'Sp500FetchError';
    if (cause) this.cause = cause;
  }
}

class StooqSp500Provider extends ISp500DrawdownProvider {
  constructor({ fetcher, url = DEFAULT_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._url = url;
    this._timeoutMs = timeoutMs;
  }

  async getLatest() {
    if (!this._fetcher) {
      throw new Sp500FetchError('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);

    let res;
    try {
      res = await this._fetcher(this._url, { signal: controller.signal });
    } catch (err) {
      throw new Sp500FetchError(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms`
          : `fetch failed: ${err && err.message ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new Sp500FetchError(`non-2xx response: ${res && res.status ? res.status : 'unknown'}`);
    }

    let text;
    try {
      text = await res.text();
    } catch (err) {
      throw new Sp500FetchError(`could not read response body: ${err.message}`, err);
    }

    return this._computeFromCsv(text);
  }

  /**
   * Parse the CSV (header: Date,Open,High,Low,Close,Volume) and compute the
   * drawdown of the last close from the maximum close across all rows.
   * @private
   */
  _computeFromCsv(csv) {
    const lines = String(csv || '').trim().split(/\r?\n/);
    if (lines.length < 2) {
      throw new Sp500FetchError('CSV has no data rows');
    }
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const closeIdx = header.indexOf('close');
    const dateIdx = header.indexOf('date');
    if (closeIdx === -1 || dateIdx === -1) {
      throw new Sp500FetchError('CSV missing Date/Close columns');
    }

    let maxClose = -Infinity;
    let lastClose = NaN;
    let lastDate = null;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const close = Number(cols[closeIdx]);
      if (!Number.isFinite(close)) continue;
      if (close > maxClose) maxClose = close;
      lastClose = close;
      lastDate = (cols[dateIdx] || '').trim();
    }

    if (!Number.isFinite(lastClose) || !Number.isFinite(maxClose) || maxClose <= 0) {
      throw new Sp500FetchError('CSV had no usable close prices');
    }
    if (!lastDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
      throw new Sp500FetchError('CSV last row has no valid date');
    }

    const drawdownPct = Number((((lastClose - maxClose) / maxClose) * 100).toFixed(2));
    return { drawdownPct, asOf: lastDate };
  }
}

module.exports = StooqSp500Provider;
module.exports.Sp500FetchError = Sp500FetchError;
