/**
 * IFredProvider Interface (feature 006)
 *
 * Generic client for the FRED observations API (St. Louis Fed). Serves the
 * US/global series (e.g. CPIAUCSL with units=pc1 for CPI YoY, DFEDTARU for the
 * Fed funds target upper bound). Requires a free API key supplied at
 * construction. Throws a typed config error when the key is missing and a
 * typed fetch error on HTTP failure.
 */

/**
 * @typedef {Object} FredReading
 * @property {number} value - The latest observation value.
 * @property {string} asOf - ISO YYYY-MM-DD.
 */

/**
 * @interface
 */
class IFredProvider {
  /**
   * @param {string} seriesId - FRED series id (e.g. 'CPIAUCSL').
   * @param {Object} [opts]
   * @param {string} [opts.units] - FRED units transform (e.g. 'pc1' for YoY %).
   * @returns {Promise<FredReading>}
   * @abstract
   */
  async getLatestObservation(_seriesId, _opts) {
    throw new Error('Method not implemented: getLatestObservation');
  }
}

module.exports = IFredProvider;
