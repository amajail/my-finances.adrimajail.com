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

  /**
   * Feature 007: set the owner-confirmed execution status on one suggested order
   * (Merge — does not touch the order's immutable fields). Throws NotFoundError
   * if the order row does not exist.
   *
   * @param {string} date - ISO YYYY-MM-DD (parent analysis date).
   * @param {number} index - order index.
   * @param {{ status: string, note?: string|null, updatedAt: string }} patch
   * @returns {Promise<{ date: string, index: number, executionStatus: string, executionNote: string|null, executionUpdatedAt: string }>}
   * @abstract
   */
  async setOrderExecutionStatus(_date, _index, _patch) {
    throw new Error('Method not implemented: setOrderExecutionStatus');
  }

  /**
   * Feature 007: true if any order for the date has a non-pending execution
   * status (i.e. the week is frozen).
   * @param {string} date
   * @returns {Promise<boolean>}
   * @abstract
   */
  async hasMarkedOrders(_date) {
    throw new Error('Method not implemented: hasMarkedOrders');
  }

  /**
   * Feature 007: all suggested orders across every analysis (for the scorecard).
   * @returns {Promise<SuggestedOrder[]>}
   * @abstract
   */
  async listAllOrders() {
    throw new Error('Method not implemented: listAllOrders');
  }
}

module.exports = IAnalysisRepository;
