/**
 * IMacroContextProvider Interface (feature 006)
 *
 * Orchestrates the 9-indicator macro panel. Fans out to the per-source
 * providers, mapping each result (or failure) to a MacroReading. NEVER throws —
 * a failed source becomes `available:false`. Aggregates the IMF classify usage
 * so the use-case can fold it into run telemetry and the cost cap.
 */

/**
 * @typedef {Object} MacroReading
 * @property {number|string|null} value - Numeric for all but imfReviewStatus (enum string). null when unavailable.
 * @property {string|null} asOf - ISO YYYY-MM-DD, or null.
 * @property {boolean} available - false when the source failed and nothing could be carried.
 * @property {string} [basis] - reserves only: "gross" (FR-008).
 */

/**
 * @typedef {Object} MacroContextResult
 * @property {Object.<string, MacroReading>} readings - Keyed by indicator
 *   (riesgoPais, fxGap, bcraReserves, argInflation, argInterestRate,
 *    usaInflation, usaInterestRate, sp500Drawdown, imfReviewStatus).
 * @property {{inputTokens:number,outputTokens:number,costUsd:number}} usage - From the IMF classify call (zeros if skipped).
 */

/**
 * @interface
 */
class IMacroContextProvider {
  /**
   * @param {Object} [opts]
   * @param {{value:string, asOf:string}|null} [opts.priorImfReading] - Prior IMF reading for carry-forward.
   * @returns {Promise<MacroContextResult>}
   * @abstract
   */
  async getLatest(_opts) {
    throw new Error('Method not implemented: getLatest');
  }
}

module.exports = IMacroContextProvider;
