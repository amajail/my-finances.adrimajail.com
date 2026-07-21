/**
 * GET /api/calendar
 *
 * Feature 017: consolidated dividend & maturity calendar. Read-only —
 * computed on request from open positions + declared dividend data
 * (contracts/calendar-api.md). Thin handler: parse → use-case → respond.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

app.http('calendar', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'calendar',
  handler: async (request, context) => {
    try {
      const days = request.query.get('days');
      const useCase = container.getGetCalendarEvents();
      const result = await useCase.execute({ days: days === null ? undefined : days });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
