/**
 * ISp500DrawdownProvider Interface (feature 006)
 *
 * Fetches the S&P 500 price history and returns the current drawdown from the
 * all-time high as a non-positive percentage. Throws a typed error on failure.
 */

/**
 * @typedef {Object} Sp500DrawdownReading
 * @property {number} drawdownPct - (lastClose − maxClose) / maxClose × 100 (≤ 0).
 * @property {string} asOf - ISO YYYY-MM-DD (last close date).
 */

/**
 * @interface
 */
class ISp500DrawdownProvider {
  /**
   * @returns {Promise<Sp500DrawdownReading>}
   * @abstract
   */
  async getLatest() {
    throw new Error('Method not implemented: getLatest');
  }
}

module.exports = ISp500DrawdownProvider;
