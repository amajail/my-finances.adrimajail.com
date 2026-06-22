/**
 * GenerateWeeklyAnalysis — feature 013 administrative / non-investable positions.
 *
 * Pins the partition behaviour:
 *   - positions with computed value <= 0 (zero OR negative) are classified
 *     administrative and excluded from drift / caps / positionChanges;
 *   - administrativePositions captures exactly that set (cash/positive stays in);
 *   - currentHoldings in the prompt excludes them and a labeled
 *     `## administrativePositions` block is added (FR-010);
 *   - the field is persisted on the analysis row.
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');
const WeeklyAnalysis = require('../../../../../src/domain/entities/WeeklyAnalysis');
const AllocationDriftCalculator = require('../../../../../src/domain/services/AllocationDriftCalculator');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);
const INSTRUCTIONS = '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, framework — inline.';

// Portfolio with: two investable positions, one zero-value stub, one
// negative-value anomaly. (Privacy: all fake symbols/values.)
function summaryWithStubs() {
  return {
    grandTotalUsd: 9000,
    totalByCurrency: { USD: 9000, ARS: 0 },
    unrealizedPnlByCurrency: { USD: 0, ARS: 0 },
    costBasisByCurrency: { USD: 9000, ARS: 0 },
    mepRate: 1450, mepRateAsOf: '2026-06-20',
    topPerformers: [], bottomPerformers: [],
    positions: [
      { brokerId: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000, status: 'open' },
      { brokerId: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000, status: 'open' },
      // zero-value stub (no recoverable price) → administrative
      { brokerId: 'iol', assetType: 'stock', symbol: 'STUBZERO', quantity: 7, averageCost: 0, currentPrice: null, currency: 'USD', valueUsd: 0, status: 'open' },
      // negative-value anomaly → administrative (zero OR negative, FR-001)
      { brokerId: 'galicia', assetType: 'on', symbol: 'NEGON', quantity: 1, averageCost: 10, currentPrice: 0, currency: 'USD', valueUsd: -5, status: 'open' },
    ],
  };
}

function mockRepoEmpty() {
  return {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
}

function buildUseCase({ repository = mockRepoEmpty(), portfolioSummary = summaryWithStubs(), allocationTargetsRepository = null } = {}) {
  let nowMs = new Date('2026-06-20T21:00:00Z').getTime();
  return {
    useCase: new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: {
        submitAnalysis: jest.fn().mockResolvedValue({
          summary: 'Executive summary: hold the core, nothing to flag this week.',
          markdownBody: longBody, orders: [],
          usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
        }),
      },
      macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings: { riesgoPais: { value: 429, asOf: '2026-06-20', available: true } }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
      getPortfolioSummary: { execute: jest.fn().mockResolvedValue(portfolioSummary) },
      settingsRepository: { get: jest.fn().mockResolvedValue(null) },
      instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-06-20T14:00:00Z' }) },
      allocationTargetsRepository,
      clock: () => new Date(nowMs++),
    }),
    repository,
  };
}

describe('GenerateWeeklyAnalysis — feature 013 administrative positions', () => {
  it('classifies value<=0 positions as administrative; investable set keeps positive value', async () => {
    const { useCase, repository } = buildUseCase();
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    const adminSymbols = result.administrativePositions.map((p) => p.symbol).sort();
    expect(adminSymbols).toEqual(['NEGON', 'STUBZERO']); // zero AND negative
    // the full snapshot is unfiltered (all four positions retained for the record)
    expect(result.portfolioSnapshot).toHaveLength(4);
    // administrative excluded from the investable holdings, not value-bearing ones
    expect(result.administrativePositions.every((p) => Number(p.valueUsd) <= 0)).toBe(true);
  });

  it('persists administrativePositions on the analysis row', async () => {
    const { useCase, repository } = buildUseCase();
    await useCase.execute({ targetDate: '2026-06-20' });
    const persisted = repository.upsert.mock.calls[0][0];
    expect(persisted.administrativePositions.map((p) => p.symbol).sort()).toEqual(['NEGON', 'STUBZERO']);
  });

  it('feeds only the investable set to allocation drift (excludes administrative)', async () => {
    const spy = jest.spyOn(AllocationDriftCalculator, 'computeDrift').mockReturnValue(null);
    const capSpy = jest.spyOn(AllocationDriftCalculator, 'computeConcentrationCaps').mockReturnValue(null);
    const allocationTargetsRepository = { getActive: jest.fn().mockResolvedValue({ buckets: [] }) };
    const { useCase } = buildUseCase({ allocationTargetsRepository });

    await useCase.execute({ targetDate: '2026-06-20' });

    const passed = spy.mock.calls[0][0];
    expect(passed.map((p) => p.symbol).sort()).toEqual(['CDR', 'FUNDX']); // no STUBZERO / NEGON
    expect(capSpy.mock.calls[0][0].map((p) => p.symbol).sort()).toEqual(['CDR', 'FUNDX']);
    spy.mockRestore();
    capSpy.mockRestore();
  });

  it('prompt: currentHoldings excludes stubs and a labeled administrativePositions block is added (FR-010)', async () => {
    const { useCase } = buildUseCase();
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });

    const userMessage = llm.submitAnalysis.mock.calls[0][0].userMessage;
    expect(userMessage).toContain('## administrativePositions');
    expect(userMessage).toContain('Do NOT flag'); // the labeled instruction
    expect(userMessage).toContain('"STUBZERO"');

    // currentHoldings block must NOT contain the stub symbols.
    const holdingsBlock = userMessage.split('## administrativePositions')[0];
    expect(holdingsBlock).toContain('## currentHoldings');
    expect(holdingsBlock).not.toContain('STUBZERO');
    expect(holdingsBlock).not.toContain('NEGON');
    // value-bearing holdings still present in currentHoldings.
    expect(holdingsBlock).toContain('FUNDX');
  });

  it('omits the administrativePositions prompt block when there are no stubs', async () => {
    const clean = summaryWithStubs();
    clean.positions = clean.positions.filter((p) => Number(p.valueUsd) > 0);
    const { useCase } = buildUseCase({ portfolioSummary: clean });
    const llm = useCase._llmClient;
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.administrativePositions).toEqual([]);
    expect(llm.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## administrativePositions');
  });

  it('does NOT classify a null-price-but-positive-value holding as administrative (FR-005)', async () => {
    const s = summaryWithStubs();
    // cash-style holding: null price but positive value (valued from quantity).
    s.positions.push({ brokerId: 'cash', assetType: 'cash', symbol: 'USDCASH', quantity: 1000, averageCost: 1, currentPrice: null, currency: 'USD', valueUsd: 1000, status: 'open' });
    const { useCase, repository } = buildUseCase({ portfolioSummary: s });
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.administrativePositions.map((p) => p.symbol)).not.toContain('USDCASH');
  });

  it('excludes administrative stubs from positionChanges (no spurious removed row)', async () => {
    // Prior week held the stub too; it must not appear as "removed" now.
    const prior = new WeeklyAnalysis({
      date: '2026-06-13', status: 'completed', generatedAt: '2026-06-13T21:00:00Z',
      modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v1',
      summary: 'Prior week summary paragraph that is long enough to validate ok.',
      markdownBody: longBody,
      portfolioSnapshot: [
        { broker: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000 },
        { broker: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000 },
        { broker: 'iol', assetType: 'stock', symbol: 'STUBZERO', quantity: 7, averageCost: 0, currentPrice: null, currency: 'USD', valueUsd: 0 },
      ],
      tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    const repo = mockRepoEmpty();
    repo.getLatest.mockResolvedValue([prior]);
    repo.getByDate.mockResolvedValue({ analysis: prior, orders: [] });
    const { useCase } = buildUseCase({ repository: repo });

    const result = await useCase.execute({ targetDate: '2026-06-20' });
    const changed = (result.positionChanges || []).map((c) => c.symbol);
    expect(changed).not.toContain('STUBZERO'); // administrative → not a change row
  });
});
