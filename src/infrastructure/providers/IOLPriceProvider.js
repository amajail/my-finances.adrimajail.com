/**
 * IOL Price Provider
 *
 * Implementation of IPriceProvider using iol.invertironline.com via HTML scraping
 * of the public cotización page. Primary source for Argentine fixed income
 * (bond, bopreal, lecap, on) in both ARS and USD; covers the gap where Yahoo
 * lacks USD-denominated Argentine sovereigns (GD35D, AL30D, BPOC7, …).
 *
 * Bond prices on IOL are quoted per VN 100 (face value 100). The per-100 →
 * per-unit conversion is handled centrally in Position.marketValue() via
 * AssetType.priceFaceValue(), so this provider stores prices verbatim.
 *
 * Parse anchor: <span data-field="UltimoPrecio">VALUE</span> nested inside the
 * <span id="IdTitulo"> header block. The sibling <span>US$|$</span> inside the
 * same block indicates currency.
 */

const IPriceProvider = require('../../application/interfaces/IPriceProvider');
const { InfrastructureError, ValidationError } = require('../../shared/errors');
const { parseArNumber } = require('./_arNumber');

const DEFAULT_BASE_URL = 'https://iol.invertironline.com/titulo/cotizacion';
const DEFAULT_EXCHANGE = 'BCBA';
const DEFAULT_TIMEOUT_MS = 10000;

class IOLPriceProvider extends IPriceProvider {
  /**
   * @param {Object} [opts]
   * @param {Function} [opts.fetcher] - fetch-compatible function (defaults to global fetch). Injectable for testing.
   * @param {string} [opts.baseUrl] - Override IOL base URL (no trailing slash).
   * @param {number} [opts.timeoutMs] - Request timeout in milliseconds.
   */
  constructor({ fetcher, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    super();
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._timeoutMs = timeoutMs;
  }

  get name() { return 'iol'; }

  /**
   * Fetch a price quote from IOL.
   * @param {Object} args - { symbol, assetType?, exchange?, currency? }
   * @returns {Promise<{ price: number, currency: string, providerSymbol: string }>}
   * @throws {ValidationError} If symbol is missing.
   * @throws {InfrastructureError} If fetch / parse fails.
   */
  async getQuote({ symbol, exchange, currency }) {
    if (!symbol) {
      throw new ValidationError('symbol is required', [{ field: 'symbol', message: 'symbol is required' }]);
    }
    if (!this._fetcher) {
      throw new InfrastructureError('No fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }

    const providerSymbol = this._toIOLSymbol(symbol);
    const exchangePath = (exchange && String(exchange).trim()) || DEFAULT_EXCHANGE;
    const url = `${this._baseUrl}/${encodeURIComponent(exchangePath)}/${encodeURIComponent(providerSymbol)}/`;

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
          throw new InfrastructureError(`IOL returned HTTP ${res.status} for ${providerSymbol}`);
        }
        html = await res.text();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof InfrastructureError) throw err;
      throw new InfrastructureError(`IOL fetch failed for ${providerSymbol}: ${err.message}`, { originalError: err }, err);
    }

    const price = this._parsePrice(html);
    if (price === null || !Number.isFinite(price) || price <= 0) {
      throw new InfrastructureError(`No price extracted from IOL for ${providerSymbol}`);
    }

    return {
      price,
      currency: currency || this._inferCurrency(html) || 'ARS',
      providerSymbol
    };
  }

  /**
   * Normalize a position symbol into the form IOL expects.
   * Strips any '.BA' Yahoo suffix; uppercases.
   * @param {string} symbol
   * @returns {string}
   */
  _toIOLSymbol(symbol) {
    return String(symbol).toUpperCase().trim().replace(/\.BA$/, '');
  }

  /**
   * Extract the last-traded price from an IOL cotización HTML page.
   * Primary anchor: data-field="UltimoPrecio" inside the IdTitulo header block.
   * Fallback: the first data-field="UltimoPrecio" anywhere on the page.
   * @param {string} html
   * @returns {number|null}
   */
  _parsePrice(html) {
    if (!html || typeof html !== 'string') return null;

    // Primary: anchored inside <span id="IdTitulo" ...>...<span data-field="UltimoPrecio">VALUE</span>
    const headerMatch = html.match(
      /id\s*=\s*"IdTitulo"[\s\S]{0,800}?data-field\s*=\s*"UltimoPrecio"\s*>\s*([0-9][0-9.,]*)\s*</i
    );
    if (headerMatch) {
      const n = parseArNumber(headerMatch[1]);
      if (Number.isFinite(n)) return n;
    }

    // Fallback: first UltimoPrecio span anywhere
    const anyMatch = html.match(/data-field\s*=\s*"UltimoPrecio"\s*>\s*([0-9][0-9.,]*)\s*</i);
    if (anyMatch) {
      const n = parseArNumber(anyMatch[1]);
      if (Number.isFinite(n)) return n;
    }

    return null;
  }

  /**
   * Infer currency from the IdTitulo header block: 'US$' → USD, plain '$' → ARS.
   * Only used when the caller does not pass currency.
   * @param {string} html
   * @returns {string|null}
   */
  _inferCurrency(html) {
    if (!html || typeof html !== 'string') return null;
    const m = html.match(/id\s*=\s*"IdTitulo"[\s\S]{0,400}?<span>\s*(US\$|\$)\s*<\/span>/i);
    if (!m) return null;
    return m[1] === 'US$' ? 'USD' : 'ARS';
  }
}

module.exports = IOLPriceProvider;
