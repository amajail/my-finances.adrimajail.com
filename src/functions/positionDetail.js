/**
 * Position detail endpoints
 * GET /api/positions/{broker}/{rowKey} - Get a specific position
 * PUT /api/positions/{broker}/{rowKey} - Update a specific position
 * DELETE /api/positions/{broker}/{rowKey} - Delete a specific position
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, noContent, mapError } = require('./_shared');
const { NotFoundError } = require('../shared/errors');

/**
 * GET /api/positions/{broker}/{rowKey}
 * Get a specific position by broker and rowKey
 */
app.http('getPosition', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'positions/{broker}/{rowKey}',
  handler: async (request, context) => {
    try {
      const broker = request.params.broker;
      const rowKey = request.params.rowKey;

      const repository = container.getPositionRepository();
      const position = await repository.findById(broker, rowKey);

      if (!position) {
        return mapError(new NotFoundError(`Position not found: ${broker}/${rowKey}`), context);
      }

      return ok({ position: position.toJSON() });
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * PUT /api/positions/{broker}/{rowKey}
 * Update a specific position
 */
app.http('updatePosition', {
  methods: ['PUT'],
  authLevel: 'function',
  route: 'positions/{broker}/{rowKey}',
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const broker = request.params.broker;
      const rowKey = request.params.rowKey;

      const updateData = { ...body, brokerId: broker, rowKey };
      const useCase = container.getUpdatePosition();
      const position = await useCase.execute(updateData);
      return ok({ position });
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * DELETE /api/positions/{broker}/{rowKey}
 * Delete a specific position
 */
app.http('deletePosition', {
  methods: ['DELETE'],
  authLevel: 'function',
  route: 'positions/{broker}/{rowKey}',
  handler: async (request, context) => {
    try {
      const broker = request.params.broker;
      const rowKey = request.params.rowKey;

      const useCase = container.getDeletePosition();
      await useCase.execute({ brokerId: broker, rowKey });
      return noContent();
    } catch (err) {
      return mapError(err, context);
    }
  },
});
