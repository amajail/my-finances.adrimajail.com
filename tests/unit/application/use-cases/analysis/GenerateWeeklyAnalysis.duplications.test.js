/**
 * GenerateWeeklyAnalysis — feature 014 duplicate-holdings wiring.
 * Detector computed over the investable snapshot; result persisted; a labeled
 * `## duplications` prompt block added (omitted when none). Fake data only.
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);
const INSTRUCTIONS = '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, framework — inline.';

function summary(positions) {
  return {
    grandTotalUsd: positions.reduce((s, p) => s + (p.valueUsd || 0), 0),
    totalByCurrency: { USD: 0, ARS: 0 }, unrealizedPnlByCurrency: { USD: 0, ARS: 0 },
    costBasisByCurrency: { USD: 0, ARS: 0 }, mepRate: 1450, mepRateAsOf: '2026-06-20',
    topPerformers: [], bottomPerformers: [], positions,
  };
}

// VIST-like underlying held as an IBKR stock AND a BullMarket cedear → duplicate.
const DUP_POSITIONS = [
  { brokerId: 'ibkr', assetType: 'stock', symbol: 'DUP', quantity: 10, averageCost: 200, currentPrice: 240, currency: 'USD', valueUsd: 2400, status: 'open' },
  { brokerId: 'bullmarket', assetType: 'cedear', symbol: 'DUP', quantity: 5, averageCost: 100, currentPrice: 132, currency: 'USD', valueUsd: 660, status: 'open' },
  { brokerId: 'iol', assetType: 'etf', symbol: 'SOLO', quantity: 1, averageCost: 100, currentPrice: 100, currency: 'USD', valueUsd: 100, status: 'open' },
];

function mockRepoEmpty() {
  return {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
}

function buildUseCase({ positions = DUP_POSITIONS } = {}) {
  let nowMs = new Date('2026-06-20T21:00:00Z').getTime();
  const repository = mockRepoEmpty();
  return {
    repository,
    useCase: new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: {
        submitAnalysis: jest.fn().mockResolvedValue({
          summary: 'Executive summary: portfolio steady, one duplication noted.',
          markdownBody: longBody, orders: [],
          usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
        }),
      },
      macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings: {}, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
      getPortfolioSummary: { execute: jest.fn().mockResolvedValue(summary(positions)) },
      settingsRepository: { get: jest.fn().mockResolvedValue(null) },
      instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-06-20T14:00:00Z' }) },
      clock: () => new Date(nowMs++),
    }),
  };
}

describe('GenerateWeeklyAnalysis — feature 014 duplications', () => {
  it('computes + persists the duplicate group (same underlying across broker/wrapper)', async () => {
    const { useCase, repository } = buildUseCase();
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.duplications).toHaveLength(1);
    expect(result.duplications[0].symbol).toBe('DUP');
    expect(result.duplications[0].placementCount).toBe(2);
    const persisted = repository.upsert.mock.calls[0][0];
    expect(persisted.duplications[0].symbol).toBe('DUP');
  });

  it('adds a labeled `## duplications` prompt block telling the model not to re-enumerate', async () => {
    const { useCase } = buildUseCase();
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });
    const userMessage = llm.submitAnalysis.mock.calls[0][0].userMessage;
    expect(userMessage).toContain('## duplications');
    expect(userMessage).toContain('do NOT re-list');
    expect(userMessage).toContain('"DUP"');
  });

  it('returns [] and omits the prompt block when there are no duplicates', async () => {
    const { useCase } = buildUseCase({ positions: [DUP_POSITIONS[2]] }); // only SOLO
    const llm = useCase._llmClient;
    const result = await useCase.execute({ targetDate: '2026-06-20' });
    expect(result.duplications).toEqual([]);
    expect(llm.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## duplications');
  });
});
