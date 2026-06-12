/**
 * GET /api/analysis/scorecard
 *
 * Feature 007: execution-rate scorecard across all analyses, overall and by
 * conviction. Read-only; no outcome P&L (deferred follow-up).
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

app.http('getSuggestionScorecard', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'analysis/scorecard',
  handler: async (request, context) => {
    try {
      const useCase = container.getGetSuggestionScorecard();
      const result = await useCase.execute();
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
