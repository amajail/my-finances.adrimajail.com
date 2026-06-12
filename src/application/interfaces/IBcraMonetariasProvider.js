/**
 * IBcraMonetariasProvider Interface (feature 006)
 *
 * Generic client for BCRA's "Principales Variables Monetarias" v4.0 API.
 * Serves multiple indicators by variable id (e.g. 1 = gross reserves,
 * 160 = monetary policy rate). Throws a typed error on failure.
 */

/**
 * @typedef {Object} BcraReading
 * @property {number} value - The latest observation value.
 * @property {string} asOf - ISO YYYY-MM-DD.
 */

/**
 * @interface
 */
class IBcraMonetariasProvider {
  /**
   * @param {number} idVariable - BCRA monetary variable id.
   * @returns {Promise<BcraReading>}
   * @abstract
   */
  async getVariable(_idVariable) {
    throw new Error('Method not implemented: getVariable');
  }
}

module.exports = IBcraMonetariasProvider;
