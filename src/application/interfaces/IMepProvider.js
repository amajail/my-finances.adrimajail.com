/**
 * IMepProvider Interface
 *
 * Fetches the current MEP rate (dólar bolsa) — ARS-per-USD — from an external
 * source. Replaces the older `mep_rate` portfolioSettings row.
 *
 * Used by GetPortfolioSummary for ARS→USD conversion of portfolio values.
 * Implementations should fall back gracefully across recent dates if today's
 * value is not yet published (e.g., early in the day, weekends, holidays).
 */

/**
 * @typedef {Object} MepReading
 * @property {number} rate  - ARS per USD (the `venta` side of the bolsa quote).
 * @property {string} asOf  - ISO YYYY-MM-DD; the date the value is as-of.
 */

/**
 * @interface
 */
class IMepProvider {
  /**
   * @returns {Promise<MepReading>}
   * @abstract
   */
  async getLatest() {
    throw new Error('Method not implemented: getLatest');
  }
}

module.exports = IMepProvider;
