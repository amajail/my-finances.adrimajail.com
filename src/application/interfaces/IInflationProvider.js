/**
 * IInflationProvider Interface (feature 006)
 *
 * Fetches the latest Argentina monthly CPI (% change). Throws a typed error
 * on failure.
 */

/**
 * @typedef {Object} InflationReading
 * @property {number} percent - Latest monthly CPI % change.
 * @property {string} asOf - ISO YYYY-MM-DD (month-end of the latest print).
 */

/**
 * @interface
 */
class IInflationProvider {
  /**
   * @returns {Promise<InflationReading>}
   * @abstract
   */
  async getLatest() {
    throw new Error('Method not implemented: getLatest');
  }
}

module.exports = IInflationProvider;
