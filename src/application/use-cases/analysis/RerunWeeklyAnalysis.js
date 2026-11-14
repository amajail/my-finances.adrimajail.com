/**
 * RerunWeeklyAnalysis — on-demand run of the weekly analysis for TODAY.
 *
 * The weekly timer stays the normal path. This use case exists for recovery:
 * a run that failed (or never fired) can be repeated without going through
 * the Azure portal. It reverses the feature-002 decision to expose no manual
 * trigger; the guards below are what make that safe.
 *
 * Guards, in order — each one refuses BEFORE any LLM spend:
 *  1. One run at a time (per Function App instance). A second request while a
 *     run is in flight is rejected rather than queued: every run is paid.
 *  2. A date whose orders carry execution statuses is frozen (feature 007) —
 *     re-running would be skipped anyway, so say so explicitly.
 *  3. A completed analysis is only replaced when the caller passes `force`.
 *     Failed or missing analyses run without it.
 *
 * The run always targets today's date (UTC, same as the timer): the analysis
 * reads live positions and prices, so labelling it with a past date would
 * misrepresent what it saw.
 */

const { AppError } = require('../../../shared/errors');

// Module-level on purpose: the lock must outlive any single use-case instance
// (the container builds a new one per request).
let runInFlight = false;

class RerunWeeklyAnalysis {
  /**
   * @param {Object} deps
   * @param {Object} deps.analysisRepository - needs getByDate, hasMarkedOrders
   * @param {Object} deps.generateWeeklyAnalysis - the GenerateWeeklyAnalysis use case
   * @param {() => Date} [deps.clock]
   */
  constructor({ analysisRepository, generateWeeklyAnalysis, clock } = {}) {
    if (!analysisRepository) throw new Error('RerunWeeklyAnalysis: analysisRepository is required');
    if (!generateWeeklyAnalysis) throw new Error('RerunWeeklyAnalysis: generateWeeklyAnalysis is required');
    this._analysisRepository = analysisRepository;
    this._generateWeeklyAnalysis = generateWeeklyAnalysis;
    this._clock = clock || (() => new Date());
  }

  /**
   * @param {Object} [input]
   * @param {boolean} [input.force=false] - replace an already-completed analysis
   * @returns {Promise<{date: string, status: string, errorMessage: string|null, generatedAt: string|null, replaced: string|null}>}
   */
  async execute({ force = false } = {}) {
    if (runInFlight) {
      throw new AppError('a weekly analysis run is already in progress', 409);
    }
    // Claim the lock synchronously, before the first await, so two requests
    // arriving together cannot both pass the check above.
    runInFlight = true;
    try {
      const date = this._clock().toISOString().slice(0, 10);

      const existing = await this._analysisRepository.getByDate(date);
      const previousStatus = existing && existing.analysis ? existing.analysis.status : null;

      if (previousStatus && await this._analysisRepository.hasMarkedOrders(date)) {
        throw new AppError(
          `the analysis for ${date} is frozen: one or more of its orders has an execution status`,
          409
        );
      }
      if (previousStatus === 'completed' && force !== true) {
        throw new AppError(
          `an analysis for ${date} already completed; pass force to replace it`,
          409
        );
      }

      const analysis = await this._generateWeeklyAnalysis.execute({ targetDate: date });
      const generatedAt = analysis.generatedAt instanceof Date
        ? analysis.generatedAt.toISOString()
        : (analysis.generatedAt || null);

      return {
        date: analysis.date,
        status: analysis.status,
        errorMessage: analysis.errorMessage || null,
        generatedAt,
        replaced: previousStatus,
      };
    } finally {
      runInFlight = false;
    }
  }
}

module.exports = RerunWeeklyAnalysis;
