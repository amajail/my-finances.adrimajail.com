/**
 * GenerateWeeklyAnalysis — feature 017 `## upcomingEvents` prompt block.
 * Optional-dep pattern (like allocationTargetsRepository): block present only
 * when the calendar use case is wired AND returns events in the 28-day
 * window; any failure or emptiness omits the block and never fails the run.
 * Fake data only.
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);
const INSTRUCTIONS = '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, framework — inline.';

const POSITIONS = [
  { brokerId: 'iol', assetType: 'bond', symbol: 'FAKE1', quantity: 100, averageCost: 50, currentPrice: 80, currency: 'ARS', valueUsd: 55, status: 'open' },
];

function summary(positions = POSITIONS) {
  return {
    grandTotalUsd: 55, totalByCurrency: { USD: 0, ARS: 0 }, unrealizedPnlByCurrency: { USD: 0, ARS: 0 },
    costBasisByCurrency: { USD: 0, ARS: 0 }, mepRate: 1450, mepRateAsOf: '2026-07-17',
    topPerformers: [], bottomPerformers: [], positions,
  };
}

const EVENT = { type: 'maturity', date: '2026-08-01', daysUntil: 11, overdue: false, symbol: 'FAKE1', broker: 'iol', assetType: 'bond', quantity: 100, amountNative: 80, currency: 'ARS', amountUsd: 55, estimated: true, source: 'position' };

function buildUseCase({ calendar } = {}) {
  let nowMs = new Date('2026-07-21T21:00:00Z').getTime();
  const repository = {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
  return new GenerateWeeklyAnalysis({
    analysisRepository: repository,
    llmClient: {
      submitAnalysis: jest.fn().mockResolvedValue({
        summary: 'Executive summary: steady week, maturity approaching.',
        markdownBody: longBody, orders: [],
        usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
      }),
    },
    macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings: {}, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
    getPortfolioSummary: { execute: jest.fn().mockResolvedValue(summary()) },
    settingsRepository: { get: jest.fn().mockResolvedValue(null) },
    instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-07-20T14:00:00Z' }) },
    getCalendarEvents: calendar,
    clock: () => new Date(nowMs++),
  });
}

describe('GenerateWeeklyAnalysis — upcomingEvents prompt block (feature 017)', () => {
  it('includes the block with trimmed fields when events fall in the 28-day window', async () => {
    const calendar = { execute: jest.fn().mockResolvedValue({ events: [EVENT] }) };
    const useCase = buildUseCase({ calendar });
    await useCase.execute({ targetDate: '2026-07-21' });

    expect(calendar.execute).toHaveBeenCalledWith({ days: 28 });
    const userMessage = useCase._llmClient.submitAnalysis.mock.calls[0][0].userMessage;
    expect(userMessage).toContain('## upcomingEvents');
    // Exact trimmed payload: no quantity/currency/source/overdue fields.
    expect(userMessage).toContain(
      JSON.stringify([{ type: 'maturity', date: '2026-08-01', daysUntil: 11, symbol: 'FAKE1', broker: 'iol', amountUsd: 55 }])
    );
    expect(userMessage).not.toContain('"source":"position"');
  });

  it('omits the block entirely when the window is empty (FR-005)', async () => {
    const calendar = { execute: jest.fn().mockResolvedValue({ events: [] }) };
    const useCase = buildUseCase({ calendar });
    await useCase.execute({ targetDate: '2026-07-21' });
    expect(useCase._llmClient.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## upcomingEvents');
  });

  it('a throwing calendar dep omits the block and the run still succeeds', async () => {
    const calendar = { execute: jest.fn().mockRejectedValue(new Error('calendar down')) };
    const useCase = buildUseCase({ calendar });
    const result = await useCase.execute({ targetDate: '2026-07-21' });
    expect(result.status).toBe('completed');
    expect(useCase._llmClient.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## upcomingEvents');
  });

  it('absent dep (null) behaves exactly as before — optional-dep pattern', async () => {
    const useCase = buildUseCase({});
    const result = await useCase.execute({ targetDate: '2026-07-21' });
    expect(result.status).toBe('completed');
    expect(useCase._llmClient.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## upcomingEvents');
  });
});
