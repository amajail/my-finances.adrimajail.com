/**
 * HTTP smoke test for GET /api/analysis/weekly/{date} (feature 002).
 *
 * Mocks the DI container's analysis repository so the test runs without
 * Azurite. Verifies status codes + response shape against contracts/api.md.
 *
 * "Integration" label is for the test location; the SDK boundary is mocked.
 */

// Capture the handler that the function file registers via app.http(...).
const httpHandlers = {};
jest.mock('@azure/functions', () => ({
  app: {
    http: (name, config) => { httpHandlers[name] = config; },
    timer: () => {},
  },
}));

const container = require('../../../src/application/di/container');
const WeeklyAnalysis = require('../../../src/domain/entities/WeeklyAnalysis');
const SuggestedOrder = require('../../../src/domain/entities/SuggestedOrder');

require('../../../src/functions/getWeeklyAnalysis');

const longBody = 'This is a long-enough narrative body. '.repeat(10);

function makeContext() {
  return {
    log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  };
}

function makeRequest({ date, query = {} } = {}) {
  return {
    params: { date },
    query: {
      get: (k) => query[k] ?? null,
    },
  };
}

function seedRepo({ analysis, orders }) {
  jest.spyOn(container, 'getAnalysisRepository').mockReturnValue({
    getByDate: jest.fn(async (d) => {
      if (analysis && analysis.date === d) return { analysis, orders: orders || [] };
      return null;
    }),
  });
}

describe('GET /api/analysis/weekly/{date}', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 200 with the completed-run shape', async () => {
    const wa = new WeeklyAnalysis({
      date: '2026-05-15',
      status: 'completed',
      generatedAt: '2026-05-15T21:00:14Z',
      modelUsed: 'claude-opus-4-7',
      promptVersion: 'weekly-rebalance-v1',
      summary: 'Executive summary text covering the week.',
      markdownBody: longBody,
      riesgoPaisBp: 524,
      riesgoPaisAsOf: '2026-05-15',
      portfolioSnapshot: [],
      tokensIn: 12000, tokensOut: 1500, costUsd: 0.30, durationMs: 45000,
      instructionsHistoryRowKey: '8284000000000-aaaa',
    });
    const orders = [
      new SuggestedOrder({
        analysisDate: '2026-05-15', index: 0,
        broker: 'ibkr', symbol: 'BRK.B', side: 'buy', quantity: 5,
        rationale: 'Standing ADD directive; framework calls position underweight.',
        conviction: 'medium',
      }),
      new SuggestedOrder({
        analysisDate: '2026-05-15', index: 1,
        broker: 'galicia', symbol: 'GD41D', side: 'buy', quantity: 50,
        rationale: 'Riesgo país below 600 bp threshold; preferred ARG-bucket deploy.',
        conviction: 'medium',
      }),
    ];
    seedRepo({ analysis: wa, orders });

    const res = await httpHandlers.getWeeklyAnalysis.handler(
      makeRequest({ date: '2026-05-15' }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.date).toBe('2026-05-15');
    expect(res.jsonBody.status).toBe('completed');
    expect(res.jsonBody.summary).toContain('Executive summary');
    expect(res.jsonBody.markdownBody).toContain(longBody.slice(0, 30));
    expect(res.jsonBody.riesgoPaisBp).toBe(524);
    // Feature 005 (FR-013): the instructions version that produced the run.
    expect(res.jsonBody.instructionsHistoryRowKey).toBe('8284000000000-aaaa');
    expect(res.jsonBody.orders).toHaveLength(2);
    expect(res.jsonBody.orders[0]).toEqual(expect.objectContaining({
      index: 0, broker: 'ibkr', symbol: 'BRK.B', side: 'buy', quantity: 5,
    }));
    // Server-side snapshot field MUST NOT be exposed on the API (see contracts/api.md).
    expect(res.jsonBody.portfolioSnapshot).toBeUndefined();
  });

  it('returns 404 when no analysis exists for the date', async () => {
    seedRepo({ analysis: null, orders: [] });

    const res = await httpHandlers.getWeeklyAnalysis.handler(
      makeRequest({ date: '2026-05-08' }),
      makeContext()
    );

    expect(res.status).toBe(404);
    expect(res.jsonBody.error).toMatch(/no analysis exists/);
  });

  it('returns 400 on malformed date', async () => {
    seedRepo({ analysis: null });

    const res = await httpHandlers.getWeeklyAnalysis.handler(
      makeRequest({ date: '15-05-2026' }),
      makeContext()
    );

    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toMatch(/invalid date format/);
  });

  it('returns 200 with the failed-run shape (no markdown, no orders)', async () => {
    const wa = new WeeklyAnalysis({
      date: '2026-05-08',
      status: 'failed',
      generatedAt: '2026-05-08T21:00:09Z',
      modelUsed: 'claude-opus-4-7',
      promptVersion: 'weekly-rebalance-v1',
      errorMessage: 'riesgo-pais source unreachable: timeout after 10000ms',
    });
    seedRepo({ analysis: wa, orders: [] });

    const res = await httpHandlers.getWeeklyAnalysis.handler(
      makeRequest({ date: '2026-05-08' }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.status).toBe('failed');
    expect(res.jsonBody.errorMessage).toMatch(/timeout after 10000ms/);
    expect(res.jsonBody.markdownBody).toBeUndefined();
    expect(res.jsonBody.summary).toBeUndefined();
    expect(res.jsonBody.orders).toEqual([]);
  });
});
