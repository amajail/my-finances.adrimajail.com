/**
 * Yahoo Finance Price Provider
 *
 * Implementation of IPriceProvider using the yahoo-finance2 npm package.
 * Fetches real-time prices from Yahoo Finance for various asset types.
 */

const IPriceProvider = require('../../application/interfaces/IPriceProvider');
const SymbolMapper = require('./SymbolMapper');
const { InfrastructureError, ValidationError } = require('../../shared/errors');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

class YahooFinancePriceProvider extends IPriceProvider {
  /**
   * Create a new YahooFinancePriceProvider
   * @param {Object} [client=yahooFinance] - Optional Yahoo Finance client for testing
   */
  constructor(client = yahooFinance) {
    super();
    this._client = client;
  }

  /**
   * Get the provider name
   * @returns {string}
   */
  get name() { return 'yahoo'; }

  /**
   * Fetch a price quote for a symbol
   * @param {Object} args - { symbol, assetType, exchange?, currency? }
   * @returns {Promise<{ price: number, currency: string, providerSymbol: string }>}
   * @throws {ValidationError} If symbol is missing
   * @throws {InfrastructureError} If no Yahoo mapping or quote fails
   */
  async getQuote({ symbol, assetType, exchange, currency }) {
    if (!symbol) throw new ValidationError('symbol is required', [{ field: 'symbol', message: 'symbol is required' }]);

    const providerSymbol = SymbolMapper.toYahoo({ symbol, assetType, exchange, currency });
    if (!providerSymbol) {
      throw new InfrastructureError(`No Yahoo mapping for ${assetType}:${symbol}`);
    }

    let raw;
    try {
      raw = await this._client.quote(providerSymbol);
    } catch (err) {
      throw new InfrastructureError(`Yahoo quote failed for ${providerSymbol}: ${err.message}`, { originalError: err }, err);
    }

    if (!raw || typeof raw.regularMarketPrice !== 'number') {
      throw new InfrastructureError(`No price returned for ${providerSymbol}`);
    }

    return {
      price: raw.regularMarketPrice,
      currency: raw.currency || currency || 'USD',
      providerSymbol
    };
  }
}

module.exports = YahooFinancePriceProvider;
