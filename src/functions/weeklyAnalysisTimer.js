/**
 * Timer trigger for the weekly LLM rebalance analysis (feature 002).
 *
 * Runs at 17:00 ET on Fridays (≈ NYSE regular-hours close + 1 hour, after
 * the daily price refresh at 16:30 has landed). DST-aware via the Function
 * App's `TZ` setting (set to `America/New_York` by the deploy workflow for
 * feature 001).
 *
 * Azure Functions timer triggers serialize invocations by default — only one
 * instance executes at a time across the scale-out, which satisfies the
 * "no concurrent runs" requirement (spec FR-003) with no code-level lock.
 *
 * Manual recovery: invoke this function from the Azure Portal's
 * "Test / Run" affordance. There is no HTTP endpoint for triggering the
 * analysis; the read endpoints are the only HTTP surface for this feature.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');

/**
 * NCRONTAB six-field format evaluated in the Function App's local TZ:
 *   seconds minutes hours day-of-month month day-of-week
 *
 *   0 0 17 * * 5  →  every Friday at 17:00 local time.
 */
const SCHEDULE = '0 0 17 * * 5';

app.timer('weeklyAnalysisTimer', {
  schedule: SCHEDULE,
  handler: async (_myTimer, context) => {
    try {
      const useCase = container.getGenerateWeeklyAnalysis();
      const result = await useCase.execute({});
      context.log('Weekly analysis run complete', {
        date: result.date,
        status: result.status,
        durationMs: result.durationMs,
      });
    } catch (err) {
      // The use-case already persisted a `failed` row before re-throwing
      // unexpected errors. We only log the type/message here, never any
      // payload (FR-029).
      context.log.error('Weekly analysis run failed', err && err.message ? err.message : String(err));
    }
  },
});

module.exports = { SCHEDULE };
