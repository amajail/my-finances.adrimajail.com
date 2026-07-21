/**
 * Dividend Events Provider Interface
 *
 * Contract for fetching upcoming (declared) dividend events for a set of
 * holdings. Feature 017: implementations MUST NEVER reject — per-symbol
 * failures are reported in `failedSymbols`, and a total source outage is
 * reported as `sourceAvailable: false` so callers can degrade gracefully
 * (FR-007) instead of failing the whole calendar.
 */
class IDividendEventsProvider {
  /**
   * Fetch upcoming dividend facts for the given holdings.
   * @param {Array<{ symbol: string, assetType: string, exchange?: string, currency?: string }>} holdings
   * @returns {Promise<{
   *   facts: Array<{ symbol: string, exDate: string|null, payDate: string|null,
   *                  perShareAnnualRate: number|null, perShareEstimate: number|null }>,
   *   failedSymbols: string[],
   *   sourceAvailable: boolean
   * }>} Never rejects.
   */
  async getUpcomingDividends(holdings) {
    throw new Error('Method not implemented: getUpcomingDividends');
  }
}

module.exports = IDividendEventsProvider;
