/**
 * PATCH /api/analysis/weekly/{date}/orders/{index}
 *
 * Feature 007: set the owner-confirmed execution status (and optional note) on
 * one suggested order. Marking any order non-pending freezes that week.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

app.http('setOrderExecutionStatus', {
  methods: ['PATCH'],
  authLevel: 'function',
  route: 'analysis/weekly/{date}/orders/{index}',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const date = request.params.date;
      const index = request.params.index;

      const useCase = container.getSetOrderExecutionStatus();
      const result = await useCase.execute({
        date,
        index,
        status: body.status,
        note: body.note,
      });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
