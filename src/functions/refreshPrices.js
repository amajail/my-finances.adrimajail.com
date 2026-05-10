/**
 * Price refresh endpoint
 * POST /api/prices/refresh - Manually trigger price refresh
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

/**
 * POST /api/prices/refresh
 * Manually trigger price refresh
 * Returns no-cache headers to ensure fresh data
 */
app.http('refreshPrices', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'prices/refresh',
  handler: async (request, context) => {
    try {
      const useCase = container.getRefreshPrices();
      const result = await useCase.execute({});
      return ok(result, { 'Cache-Control': 'no-store' });
    } catch (err) {
      return mapError(err, context);
    }
  },
});
