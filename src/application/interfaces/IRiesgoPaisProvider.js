/**
 * IRiesgoPaisProvider Interface
 *
 * Fetches the current Argentina country-risk reading from a public source.
 * Used by GenerateWeeklyAnalysis (feature 002) to surface the FR-013 trigger
 * (riesgo país > 600 bp) in each weekly run.
 */

/**
 * @typedef {Object} RiesgoPaisReading
 * @property {number} basisPoints - Country risk in basis points (non-negative integer).
 * @property {string} asOf - ISO YYYY-MM-DD; the date the value is as-of.
 */

/**
 * @interface
 */
class IRiesgoPaisProvider {
  /**
   * Fetch the most-recent reading.
   *
   * Implementations MUST throw on timeout, non-2xx HTTP response, or empty
   * payload (use the provider's typed error class) so callers can persist a
   * "failed" analysis row instead of silently substituting a stale value.
   *
   * @returns {Promise<RiesgoPaisReading>}
   * @abstract
   */
  async getLatest() {
    throw new Error('Method not implemented: getLatest');
  }
}

module.exports = IRiesgoPaisProvider;
