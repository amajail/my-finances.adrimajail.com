/**
 * Broker endpoints
 * GET /api/brokers - List all brokers
 * POST /api/brokers - Create a new broker
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, created, mapError } = require('./_shared');

/**
 * GET /api/brokers
 * List all brokers
 */
app.http('listBrokers', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'brokers',
  handler: async (request, context) => {
    try {
      const useCase = container.getListBrokers();
      const brokers = await useCase.execute({});
      return ok({ brokers });
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * POST /api/brokers
 * Create a new broker
 */
app.http('createBroker', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'brokers',
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const useCase = container.getCreateBroker();
      const broker = await useCase.execute(body || {});
      return created({ broker });
    } catch (err) {
      return mapError(err, context);
    }
  },
});
