/**
 * GET /api/analysis/performance
 *
 * Feature 009: weekly portfolio value + MEP (persisted) and S&P 500 / US CPI /
 * AR CPI benchmark levels (fetched server-side on-demand) aligned per analysis
 * date, ascending. Read-only. The FRED key never leaves the server.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

app.http('getPerformanceSeries', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'analysis/performance',
  handler: async (request, context) => {
    try {
      const weeks = request.query.get('weeks');
      const useCase = container.getGetPerformanceSeries();
      const result = await useCase.execute({ weeks });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
