/**
 * GET /api/calendar — route smoke tests per contracts/calendar-api.md.
 * The registration is captured by mocking @azure/functions; the container's
 * use case is stubbed. Fake data only.
 */

jest.mock('@azure/functions', () => ({
  app: { http: jest.fn() },
}));

jest.mock('../../../src/application/di/container', () => ({
  getGetCalendarEvents: jest.fn(),
}));

const { app } = require('@azure/functions');
const container = require('../../../src/application/di/container');
const { ValidationError } = require('../../../src/shared/errors');

require('../../../src/functions/calendar');

const [name, config] = app.http.mock.calls[0];

function requestWith(days) {
  return { query: { get: (k) => (k === 'days' ? days : null) } };
}

const context = { log: Object.assign(jest.fn(), { error: jest.fn() }) };

describe('GET /api/calendar registration', () => {
  it('registers GET calendar with function auth', () => {
    expect(name).toBe('calendar');
    expect(config.methods).toEqual(['GET']);
    expect(config.authLevel).toBe('function');
    expect(config.route).toBe('calendar');
  });
});

describe('GET /api/calendar handler', () => {
  it('returns 200 with the use-case result (events + months shape)', async () => {
    const payload = {
      horizonDays: 180, generatedAt: '2026-07-21T00:00:00.000Z',
      dividendSourceAvailable: true, fixedIncomeWithoutMaturity: 0,
      events: [{ type: 'maturity', symbol: 'FAKE1' }],
      months: [{ month: '2026-09', totalUsd: 55, excludedFromTotal: 0, eventCount: 1 }],
    };
    container.getGetCalendarEvents.mockReturnValue({ execute: jest.fn().mockResolvedValue(payload) });
    const res = await config.handler(requestWith(null), context);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual(payload);
  });

  it('maps ValidationError (days=0) to 400 per contract', async () => {
    container.getGetCalendarEvents.mockReturnValue({
      execute: jest.fn().mockRejectedValue(new ValidationError('days must be an integer between 1 and 400')),
    });
    const res = await config.handler(requestWith('0'), context);
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toMatch(/days must be an integer/);
  });

  it('degraded dividend source is still a 200, never a 500 (FR-007)', async () => {
    container.getGetCalendarEvents.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        horizonDays: 180, dividendSourceAvailable: false, fixedIncomeWithoutMaturity: 0,
        events: [{ type: 'maturity', symbol: 'FAKE1' }], months: [],
      }),
    });
    const res = await config.handler(requestWith(null), context);
    expect(res.status).toBe(200);
    expect(res.jsonBody.dividendSourceAvailable).toBe(false);
    expect(res.jsonBody.events).toHaveLength(1);
  });
});
