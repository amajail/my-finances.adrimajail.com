/**
 * Settings endpoints
 * GET /api/settings/{key} - Get a setting value
 * PUT /api/settings/{key} - Update a setting value
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

/**
 * GET /api/settings/{key}
 * Get a setting value by key
 */
app.http('getSetting', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'settings/{key}',
  handler: async (request, context) => {
    try {
      const key = request.params.key;
      const useCase = container.getGetSetting();
      const result = await useCase.execute({ key });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * PUT /api/settings/{key}
 * Update a setting value
 */
app.http('updateSetting', {
  methods: ['PUT'],
  authLevel: 'function',
  route: 'settings/{key}',
  handler: async (request, context) => {
    try {
      const key = request.params.key;
      const body = await request.json();
      const value = body?.value;

      const useCase = container.getUpdateSetting();
      const result = await useCase.execute({ key, value });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
