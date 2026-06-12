/**
 * IFxGapProvider Interface (feature 006)
 *
 * Fetches the MEP (financial) and official USD rates and returns the gap %.
 * Implementations MUST throw a typed error on failure; the MacroContextProvider
 * maps that to an `available:false` reading (resilience lives in the orchestrator).
 */

/**
 * @typedef {Object} FxGapReading
 * @property {number} gapPct - (mep − oficial) / oficial × 100.
 * @property {string} asOf - ISO YYYY-MM-DD.
 */

/**
 * @interface
 */
class IFxGapProvider {
  /**
   * @returns {Promise<FxGapReading>}
   * @abstract
   */
  async getLatest() {
    throw new Error('Method not implemented: getLatest');
  }
}

module.exports = IFxGapProvider;
