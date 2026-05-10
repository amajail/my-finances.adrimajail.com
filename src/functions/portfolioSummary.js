/**
 * Portfolio Summary endpoint
 * GET /api/portfolio/summary - Get portfolio summary with caching
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

/**
 * GET /api/portfolio/summary
 * Get portfolio summary with 30-second cache
 */
app.http('portfolioSummary', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'portfolio/summary',
  handler: async (request, context) => {
    try {
      const useCase = container.getGetPortfolioSummary();
      const summary = await useCase.execute({});
      return ok(summary, { 'Cache-Control': 'max-age=30' });
    } catch (err) {
      return mapError(err, context);
    }
  },
});
