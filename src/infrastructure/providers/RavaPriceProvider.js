/**
 * Rava Price Provider
 *
 * Implementation of IPriceProvider using rava.com (an Argentine financial site)
 * via HTML scraping. Used for ARS-denominated fixed-income instruments
 * (bonds, bopreal, lecap, ON) that Yahoo Finance does not cover.
 *
 * Bond prices on Rava are quoted per VN 100 (face value 100) — same convention
 * as Yahoo's Argentine bond quotes. The per-100 → per-unit conversion is
 * handled centrally in Position.marketValue() via AssetType.priceFaceValue(),
 * so this provider stores prices verbatim in the broker's quoted convention.
 */

const IPriceProvider = require('../../application/interfaces/IPriceProvider');
const { InfrastructureError, ValidationError } = require('../../shared/errors');

const DEFAULT_BASE_URL = 'https://www.rava.com/perfil';
const DEFAULT_TIMEOUT_MS = 10000;

class RavaPriceProvider extends IPriceProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.fetcher] - fetch-compatible function (defaults to global fetch). Injectable for testing.
   * @param {string} [opts.baseUrl] - Override Rava base URL (no trailing slash).
   * @param {number} [opts.timeoutMs] - Request timeout in milliseconds.
   */
  constructor({ fetcher, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._timeoutMs = timeoutMs;
  }

  get name() { return 'rava'; }

  /**
   * Fetch a price quote from Rava.
   * @param {Object} args - { symbol, assetType, exchange?, currency? }
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

    const providerSymbol = this._toRavaSymbol(symbol);
    const url = `${this._baseUrl}/${encodeURIComponent(providerSymbol)}`;

    let html;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeoutMs);
      try {
        const res = await this._fetcher(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'my-finances/0.1 (+https://github.com/local)' }
        });
        if (!res.ok) {
          throw new InfrastructureError(`Rava returned HTTP ${res.status} for ${providerSymbol}`);
        }
        html = await res.text();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof InfrastructureError) throw err;
      throw new InfrastructureError(`Rava fetch failed for ${providerSymbol}: ${err.message}`, { originalError: err }, err);
    }

    const price = this._parsePrice(html);
    if (price === null || !Number.isFinite(price) || price <= 0) {
      throw new InfrastructureError(`No price extracted from Rava for ${providerSymbol}`);
    }

    return {
      price,
      currency: currency || 'ARS',
      providerSymbol
    };
  }

  /**
   * Normalize a position symbol into the form Rava expects.
   * Strips any '.BA' Yahoo suffix; uppercases.
   * @param {string} symbol
   * @returns {string}
   */
  _toRavaSymbol(symbol) {
    return String(symbol).toUpperCase().trim().replace(/\.BA$/, '');
  }

  /**
   * Extract the last-traded price from a Rava /perfil HTML page.
   * Rava embeds quote data in script tags as JSON (look for "ultimo")
   * and also as data attributes on the page header.
   * @param {string} html
   * @returns {number|null}
   */
  _parsePrice(html) {
    if (!html || typeof html !== 'string') return null;

    // Embedded JSON: "ultimo": 1234.56  or  "ultimo":"1.234,56"
    const jsonMatch = html.match(/"ultimo"\s*:\s*"?([0-9][0-9.,]*)"?/i);
    if (jsonMatch) {
      const n = parseArNumber(jsonMatch[1]);
      if (Number.isFinite(n)) return n;
    }

    // Data attribute fallback: data-ultimo="1.234,56"
    const attrMatch = html.match(/data-ultimo\s*=\s*"([0-9][0-9.,]*)"/i);
    if (attrMatch) {
      const n = parseArNumber(attrMatch[1]);
      if (Number.isFinite(n)) return n;
    }

    return null;
  }
}

/**
 * Parse a number string that may use Argentine notation ('.' thousands, ',' decimal)
 * or plain JSON-style notation ('.' decimal, no thousand separators).
 * Examples: "1.234,56" -> 1234.56;  "1234.56" -> 1234.56;  "150" -> 150
 * @param {string} s
 * @returns {number}
 */
function parseArNumber(s) {
  if (s === null || s === undefined) return NaN;
  const trimmed = String(s).trim();
  if (!trimmed) return NaN;
  if (trimmed.includes(',')) {
    return parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(trimmed);
}

module.exports = RavaPriceProvider;
module.exports._parseArNumber = parseArNumber;
