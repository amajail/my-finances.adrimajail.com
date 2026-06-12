/**
 * IImfStatusProvider Interface (feature 006)
 *
 * Derives the current IMF program review status for Argentina from the trailing
 * week's IMF news (RSS filtered for "Argentina"), classified by a small AI call.
 * Implements carry-forward with an 8-week staleness cap (FR-007).
 *
 * Unlike the other providers this one does NOT simply throw on "no news" — it
 * carries the prior reading forward. It throws only when it cannot produce a
 * value AND has no prior reading to carry.
 */

/**
 * @typedef {Object} ImfStatusReading
 * @property {string} status - Enum: none|pending|staff-level-agreement|approved|disbursement|unknown.
 * @property {string} asOf - ISO YYYY-MM-DD.
 * @property {{inputTokens:number,outputTokens:number,costUsd:number}} usage - Classify-call cost (zeros when no call was made).
 */

/**
 * @interface
 */
class IImfStatusProvider {
  /**
   * @param {Object} [opts]
   * @param {{value:string, asOf:string}|null} [opts.priorReading] - The prior analysis's IMF reading, for carry-forward.
   * @returns {Promise<ImfStatusReading>}
   * @abstract
   */
  async getLatest(_opts) {
    throw new Error('Method not implemented: getLatest');
  }
}

module.exports = IImfStatusProvider;
