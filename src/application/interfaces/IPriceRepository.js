/**
 * IPriceRepository Interface
 *
 * Repository interface for Price Quote persistence following Repository pattern.
 * Defines the contract for price/quote data access operations.
 * Infrastructure layer will implement this interface.
 */

/**
 * @typedef {Object} PriceQuote
 * @property {string} symbol - Asset symbol/ticker
 * @property {number} price - Quote price
 * @property {string} currency - Currency of the price
 * @property {string} provider - Data provider name
 * @property {string} [providerSymbol] - Symbol used by the provider
 * @property {Date|string} fetchedAt - When the quote was fetched
 * @property {boolean} success - Whether the fetch was successful
 * @property {string} [errorMessage] - Error message if unsuccessful
 */

/**
 * Price Repository Interface
 * @interface
 */
class IPriceRepository {
  /**
   * Record a new price quote
   * @param {PriceQuote} quote - Quote to record
   * @returns {Promise<void>}
   * @abstract
   */
  async recordQuote(quote) {
    throw new Error('Method not implemented: recordQuote');
  }

  /**
   * Get the latest successful quote for a symbol
   * @param {string} symbol - Asset symbol/ticker
   * @returns {Promise<PriceQuote|null>} Latest successful quote or null if none found
   * @abstract
   */
  async getLatestForSymbol(symbol) {
    throw new Error('Method not implemented: getLatestForSymbol');
  }

  /**
   * Get recent quotes across all symbols
   * Returns both successful and failed quotes, most recent first
   * @param {number} [limit=100] - Maximum number of quotes to return
   * @returns {Promise<PriceQuote[]>} Recent quotes
   * @abstract
   */
  async getRecent(limit = 100) {
    throw new Error('Method not implemented: getRecent');
  }
}

module.exports = IPriceRepository;
