/**
 * Price Provider Interface
 *
 * Defines the contract for price data providers.
 * Implementations should fetch real-time or near-real-time prices
 * from external sources (Yahoo Finance, etc.)
 */
class IPriceProvider {
  /**
   * Fetch a price quote for a symbol.
   * @param {Object} args - { symbol, assetType, exchange?, currency? }
   * @returns {Promise<{ price: number, currency: string, providerSymbol: string }>}
   * @throws {Error} on lookup failure (no quote, network, etc.)
   */
  async getQuote(args) {
    throw new Error('Method not implemented: getQuote');
  }

  /**
   * Provider name identifier (e.g., 'yahoo').
   * @returns {string}
   */
  get name() {
    throw new Error('Property not implemented: name');
  }
}

module.exports = IPriceProvider;
