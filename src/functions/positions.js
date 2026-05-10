/**
 * Position endpoints
 * GET /api/positions - List positions with optional filters
 * POST /api/positions - Add a new position
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, created, mapError } = require('./_shared');

/**
 * GET /api/positions
 * List positions with optional ?broker= and ?status= filters
 * Status defaults to 'open' if not provided
 */
app.http('listPositions', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'positions',
  handler: async (request, context) => {
    try {
      const broker = request.query.get('broker');
      const status = request.query.get('status') || 'open';

      const useCase = container.getListPositions();
      const positions = await useCase.execute({ broker, status });
      return ok({ positions });
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * POST /api/positions
 * Add a new position
 */
app.http('addPosition', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'positions',
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const useCase = container.getAddPosition();
      const position = await useCase.execute(body || {});
      return created({ position });
    } catch (err) {
      return mapError(err, context);
    }
  },
});
