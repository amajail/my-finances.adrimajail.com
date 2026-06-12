/**
 * GET /api/analysis/macro-series
 *
 * Feature 008: time-ordered projection of the persisted macro panel + portfolio
 * totals across analyses, for the charts page. Read-only.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

app.http('getMacroSeries', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'analysis/macro-series',
  handler: async (request, context) => {
    try {
      const weeks = request.query.get('weeks');
      const useCase = container.getGetMacroSeries();
      const result = await useCase.execute({ weeks });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
