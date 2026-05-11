/**
 * Cohen Price Provider
 *
 * Implementation of IPriceProvider using cohen.com.ar via HTML scraping of the
 * public Especie page. Used as the ARS fixed-income fallback when IOL is
 * unavailable.
 *
 * URL pattern: https://www.cohen.com.ar/Bursatil/Especie/{symbol} (no exchange
 * path). Cohen embeds quote objects inline as JSON; we extract the first
 * `"PrecioUltimo":N` numeric value and the first `"Moneda":"$"|"U$S"` for
 * currency inference.
 *
 * Prices stored verbatim per the per-VN-100 convention; per-100 → per-unit
 * conversion happens centrally in Position.marketValue().
 */

const IPriceProvider = require('../../application/interfaces/IPriceProvider');
const { InfrastructureError, ValidationError } = require('../../shared/errors');
const { parseArNumber } = require('./_arNumber');

const DEFAULT_BASE_URL = 'https://www.cohen.com.ar/Bursatil/Especie';
const DEFAULT_TIMEOUT_MS = 10000;
// Cohen rejects default curl/non-browser User-Agents at the edge (returns 60 / TLS error).
// Use a generic browser UA to keep the fetch reliable.
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

class CohenPriceProvider extends IPriceProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.fetcher] - fetch-compatible function (defaults to global fetch). Injectable for testing.
   * @param {string} [opts.baseUrl] - Override Cohen base URL (no trailing slash).
   * @param {number} [opts.timeoutMs] - Request timeout in milliseconds.
   */
  constructor({ fetcher, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._timeoutMs = timeoutMs;
  }

  get name() { return 'cohen'; }

  /**
   * Fetch a price quote from Cohen.
   * @param {Object} args - { symbol, assetType?, exchange?, currency? }
   * @returns {Promise<{ price: number, currency: string, providerSymbol: string }>}
   * @throws {ValidationError} If symbol is missing.
   * @throws {InfrastructureError} If fetch / parse fails.
   */
  async getQuote({ symbol, currency }) {
    if (!symbol) {
      throw new ValidationError('symbol is required', [{ field: 'symbol', message: 'symbol is required' }]);
    }
    if (!this._fetcher) {
      throw new InfrastructureError('No fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const providerSymbol = this._toCohenSymbol(symbol);
    const url = `${this._baseUrl}/${encodeURIComponent(providerSymbol)}`;

    let html;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeoutMs);
      try {
        const res = await this._fetcher(url, {
          signal: controller.signal,
          headers: { 'User-Agent': BROWSER_UA }
        });
        if (!res.ok) {
          throw new InfrastructureError(`Cohen returned HTTP ${res.status} for ${providerSymbol}`);
        }
        html = await res.text();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof InfrastructureError) throw err;
      throw new InfrastructureError(`Cohen fetch failed for ${providerSymbol}: ${err.message}`, { originalError: err }, err);
    }

    const price = this._parsePrice(html);
    if (price === null || !Number.isFinite(price) || price <= 0) {
      throw new InfrastructureError(`No price extracted from Cohen for ${providerSymbol}`);
    }

    return {
      price,
      currency: currency || this._inferCurrency(html) || 'ARS',
      providerSymbol
    };
  }

  /**
   * Normalize a position symbol into the form Cohen expects.
   * Strips any '.BA' Yahoo suffix; uppercases.
   * @param {string} symbol
   * @returns {string}
   */
  _toCohenSymbol(symbol) {
    return String(symbol).toUpperCase().trim().replace(/\.BA$/, '');
  }

  /**
   * Extract the last-traded price from a Cohen Especie HTML page.
   * Cohen embeds inline JSON like: "PrecioUltimo":149500.000,"PrecioApertura":...
   * Falls back to a quoted Argentine-notation form ("PrecioUltimo":"1.234,56") if
   * the page ever switches encoding — the two cases must be matched separately so
   * a comma inside a JSON-number capture doesn't get mis-parsed as a decimal mark.
   * @param {string} html
   * @returns {number|null}
   */
  _parsePrice(html) {
    if (!html || typeof html !== 'string') return null;

    const quoted = html.match(/"PrecioUltimo"\s*:\s*"([^"]+)"/);
    if (quoted) {
      const n = parseArNumber(quoted[1]);
      if (Number.isFinite(n)) return n;
    }

    const plain = html.match(/"PrecioUltimo"\s*:\s*(-?[0-9]+(?:\.[0-9]+)?)/);
    if (plain) {
      const n = parseFloat(plain[1]);
      if (Number.isFinite(n)) return n;
    }

    return null;
  }

  /**
   * Infer currency from the inline "Moneda" key. Cohen uses "$" for ARS and
   * "U$S" for USD (note: NOT "US$" like IOL). Only used when caller omits currency.
   * @param {string} html
   * @returns {string|null}
   */
  _inferCurrency(html) {
    if (!html || typeof html !== 'string') return null;
    const m = html.match(/"Moneda"\s*:\s*"([^"]+)"/);
    if (!m) return null;
    const v = m[1].trim();
    if (/^u\$?s$/i.test(v) || /^usd$/i.test(v)) return 'USD';
    if (v === '$' || /^ars$/i.test(v) || /^pesos?$/i.test(v)) return 'ARS';
    return null;
  }
}

module.exports = CohenPriceProvider;
