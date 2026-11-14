/**
 * POST /api/analysis/weekly/run — run the weekly analysis now, for today.
 *
 * Recovery path for a failed or missed run (see RerunWeeklyAnalysis for the
 * guards). Body is optional: `{ "force": true }` replaces an analysis that
 * already completed today.
 *
 * Responses:
 *   200 { date, status, errorMessage, generatedAt, replaced } — the run
 *       finished. `status` may be "failed": a failed run is still recorded.
 *   409 — a run is in progress, the date is frozen, or today's analysis
 *       already completed and `force` was not passed.
 *
 * A run takes minutes and can outlive the platform's HTTP response window.
 * The run itself is not cancelled when that happens, so callers that get a
 * gateway timeout should poll GET /api/analysis/weekly/{date} instead of
 * retrying this endpoint.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

app.http('runWeeklyAnalysis', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'analysis/weekly/run',
  handler: async (request, context) => {
    try {
      let body = {};
      try {
        body = (await request.json()) || {};
      } catch (_err) {
        // An empty or non-JSON body means "no options".
      }
      const result = await container.getRerunWeeklyAnalysis().execute({ force: body.force === true });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
