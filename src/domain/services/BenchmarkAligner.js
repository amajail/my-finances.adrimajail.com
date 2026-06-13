/**
 * BenchmarkAligner (feature 009)
 *
 * Pure domain service: aligns a benchmark observation series to a set of analysis
 * dates using the nearest observation **on or before** each date (FR-007). A date
 * that precedes the entire series is a gap (`available:false`) — never interpolated
 * or matched to a future reading (FR-008). Each aligned reading carries the source
 * observation's own date as `asOf`.
 */

class BenchmarkAligner {
  /**
   * @param {Array<{date: string, value: number}>} observations - ascending by date.
   * @param {string[]} dates - analysis dates (any order).
   * @returns {Array<{date: string, value: number|null, asOf: string|null, available: boolean}>}
   *          one entry per input date, in the same order.
   */
  static alignOnOrBefore(observations, dates) {
    const obs = (Array.isArray(observations) ? observations : [])
      .filter((o) => o && typeof o.date === 'string' && Number.isFinite(Number(o.value)))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    return (Array.isArray(dates) ? dates : []).map((date) => {
      // Latest observation with obsDate <= date.
      let match = null;
      for (const o of obs) {
        if (o.date <= date) match = o; else break;
      }
      if (!match) return { date, value: null, asOf: null, available: false };
      return { date, value: Number(match.value), asOf: match.date, available: true };
    });
  }
}

module.exports = BenchmarkAligner;
