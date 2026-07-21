/**
 * GenerateWeeklyAnalysis — concentrationCaps prompt delivery.
 * Feature 010 computed + persisted the cap status for the dashboard but never
 * sent it to the model; instruction-document escalation rules (B4) need the
 * exact figures. A labeled `## concentrationCaps` block is added when targets
 * yield caps, omitted when targets are unavailable. Fake data only.
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

const POSITIONS = [
  { brokerId: 'ibkr', assetType: 'etf', symbol: 'CAPPED', quantity: 10, averageCost: 100, currentPrice: 150, currency: 'USD', valueUsd: 1500, status: 'open' },
  { brokerId: 'iol', assetType: 'etf', symbol: 'OTHER', quantity: 5, averageCost: 100, currentPrice: 100, currency: 'USD', valueUsd: 500, status: 'open' },
];

const TARGETS = {
  buckets: [{ key: 'us', label: 'US', targetPct: 100, match: { brokers: ['ibkr', 'iol'] } }],
  assetClasses: [],
  concentrationCaps: [
    { label: 'CAPPED', scope: 'portfolio', match: { symbol: 'CAPPED' }, softPct: 50, hardPct: 80 },
  ],
};

function mockRepoEmpty() {
  return {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
}

function buildUseCase({ targets = TARGETS } = {}) {
  let nowMs = new Date('2026-06-20T21:00:00Z').getTime();
  const repository = mockRepoEmpty();
  return {
    repository,
    useCase: new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: {
        submitAnalysis: jest.fn().mockResolvedValue({
          summary: 'Executive summary: portfolio steady, cap status noted.',
          markdownBody: longBody, orders: [],
          usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
        }),
      },
      macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings: {}, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
      getPortfolioSummary: { execute: jest.fn().mockResolvedValue(summary(POSITIONS)) },
      settingsRepository: { get: jest.fn().mockResolvedValue(null) },
      instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-06-20T14:00:00Z' }) },
      allocationTargetsRepository: targets === null ? undefined : { getActive: jest.fn().mockResolvedValue(targets) },
      clock: () => new Date(nowMs++),
    }),
  };
}

describe('GenerateWeeklyAnalysis — concentrationCaps prompt block', () => {
  it('delivers a labeled `## concentrationCaps` block with the exact computed figures', async () => {
    const { useCase } = buildUseCase();
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });
    const userMessage = llm.submitAnalysis.mock.calls[0][0].userMessage;
    expect(userMessage).toContain('## concentrationCaps');
    expect(userMessage).toContain('do not recompute');
    // CAPPED is 1500 of 2000 total = 75% → soft breach (soft 50, hard 80).
    expect(userMessage).toContain('"currentPct":75');
    expect(userMessage).toContain('"breach":"soft"');
  });

  it('omits the block entirely when no allocation targets repository is wired', async () => {
    const { useCase } = buildUseCase({ targets: null });
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });
    expect(llm.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## concentrationCaps');
  });

  it('still persists the caps for the dashboard unchanged (no regression)', async () => {
    const { useCase, repository } = buildUseCase();
    await useCase.execute({ targetDate: '2026-06-20' });
    const persisted = repository.upsert.mock.calls[0][0];
    expect(persisted.concentrationCaps).toHaveLength(1);
    expect(persisted.concentrationCaps[0].label).toBe('CAPPED');
  });
});
