/**
 * IAnalysisRepository Interface
 *
 * Repository interface for WeeklyAnalysis + SuggestedOrder persistence.
 * Backed at the infrastructure layer by AzureAnalysisRepository, which owns
 * the `portfolioAnalysis` and `portfolioOrders` Azure Tables.
 *
 * Used by the GenerateWeeklyAnalysis use-case (feature 002).
 */

/**
 * @interface
 */
class IAnalysisRepository {
  /**
   * Get the most-recent N analyses, newest first.
   *
   * @param {number} [limit=20] - Max rows to return (clamped at 200 by callers).
   * @returns {Promise<WeeklyAnalysis[]>}
   * @abstract
   */
  async getLatest(_limit = 20) {
    throw new Error('Method not implemented: getLatest');
  }

  /**
   * Fetch one analysis + its suggested orders by target date.
   *
   * @param {string} date - ISO YYYY-MM-DD.
   * @returns {Promise<{ analysis: WeeklyAnalysis, orders: SuggestedOrder[] }|null>}
   * @abstract
   */
  async getByDate(_date) {
    throw new Error('Method not implemented: getByDate');
  }

  /**
   * Upsert one analysis + replace its suggested orders atomically.
   * If a row already exists for `weeklyAnalysis.date`, its narrative + metadata
   * are overwritten and prior order rows are deleted before the new ones land.
   *
   * @param {WeeklyAnalysis} weeklyAnalysis
   * @param {SuggestedOrder[]} suggestedOrders
   * @returns {Promise<void>}
   * @abstract
   */
  async upsert(_weeklyAnalysis, _suggestedOrders) {
    throw new Error('Method not implemented: upsert');
  }
}

module.exports = IAnalysisRepository;
