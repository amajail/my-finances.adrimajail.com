/**
 * GenerateWeeklyAnalysis — degraded-FX refusal (Slice D).
 *
 * When GetPortfolioSummary reports fxDegraded (MEP provider outage), every
 * USD-derived deterministic input to the analysis is unreliable (ARS valueUsd
 * is null → partitioning/drift/caps would misclassify ARS holdings). The run
 * must REFUSE: persist a failed WeeklyAnalysis naming the outage, call
 * neither the macro provider nor the LLM, and spend no tokens.
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');
const WeeklyAnalysis = require('../../../../../src/domain/entities/WeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);

function fakeDegradedSummary() {
  return {
    grandTotalUsd: null,
    totalByCurrency: { USD: 90000, ARS: 14500000 },
    unrealizedPnlByCurrency: { USD: 1200, ARS: -50000 },
    costBasisByCurrency: { USD: 88800, ARS: 14550000 },
    mepRate: null,
    mepRateAsOf: null,
    fxDegraded: true,
    fxError: 'MEP provider failed: upstream timeout',
    positions: [
      {
        brokerId: 'ibkr', assetType: 'stock', symbol: 'BRK.B',
        quantity: 10, averageCost: 350, currentPrice: 400,
        currency: 'USD', valueUsd: 4000, status: 'open',
      },
      {
        brokerId: 'galicia', assetType: 'stock', symbol: 'GGAL',
        quantity: 100, averageCost: 4000, currentPrice: 5000,
        currency: 'ARS', valueUsd: null, status: 'open',
      },
    ],
  };
}

function fakeHealthySummary() {
  const s = fakeDegradedSummary();
  return {
    ...s,
    grandTotalUsd: 100000,
    mepRate: 1450,
    mepRateAsOf: '2026-05-15',
    fxDegraded: false,
    fxError: null,
    positions: s.positions.map((p) => ({ ...p, valueUsd: p.valueUsd === null ? 344 : p.valueUsd })),
  };
}

function fakeMacroReadings() {
  return {
    riesgoPais: { value: 524, asOf: '2026-05-15', available: true },
  };
}

function buildUseCase({ portfolioSummary }) {
  const repository = {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
  const llmClient = {
    submitAnalysis: jest.fn().mockResolvedValue({
      summary: 'Executive summary: hold everything, no action warranted this week.',
      markdownBody: longBody,
      orders: [],
      usage: { inputTokens: 12000, outputTokens: 1500, costUsd: 0.30 },
    }),
  };
  const macroContextProvider = {
    getLatest: jest.fn().mockResolvedValue({
      readings: fakeMacroReadings(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    }),
  };
  let nowMs = new Date('2026-05-15T21:00:00Z').getTime();
  const useCase = new GenerateWeeklyAnalysis({
    analysisRepository: repository,
    llmClient,
    macroContextProvider,
    getPortfolioSummary: { execute: jest.fn().mockResolvedValue(portfolioSummary) },
    settingsRepository: { get: jest.fn().mockResolvedValue(null) },
    instructionsRepository: {
      getActive: jest.fn(async () => ({ content: '# INSTRUCTIONS', historyRowKey: 'rk-active' })),
    },
    clock: () => new Date(nowMs++),
  });
  return { useCase, repository, llmClient, macroContextProvider };
}

describe('GenerateWeeklyAnalysis (degraded FX)', () => {
  it('refuses when the summary is fxDegraded: persists a failed row naming the outage', async () => {
    const { useCase, repository } = buildUseCase({ portfolioSummary: fakeDegradedSummary() });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result).toBeInstanceOf(WeeklyAnalysis);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/FX degraded/);
    expect(result.errorMessage).toMatch(/MEP rate unavailable/);
    expect(result.errorMessage).toMatch(/upstream timeout/);
    // The failed row is persisted with no orders.
    expect(repository.upsert).toHaveBeenCalledTimes(1);
    const [persisted, orders] = repository.upsert.mock.calls[0];
    expect(persisted.status).toBe('failed');
    expect(orders).toEqual([]);
    // The portfolio state at refusal time is still captured, mepRate stays
    // null (not coerced to a plausible-looking number).
    expect(persisted.portfolioSnapshot.length).toBe(2);
    expect(persisted.portfolioTotals.mepRate).toBeNull();
  });

  it('spends nothing on a degraded run: neither the macro provider nor the LLM is called', async () => {
    const { useCase, llmClient, macroContextProvider } = buildUseCase({
      portfolioSummary: fakeDegradedSummary(),
    });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.status).toBe('failed');
    expect(llmClient.submitAnalysis).not.toHaveBeenCalled();
    expect(macroContextProvider.getLatest).not.toHaveBeenCalled();
    expect(result.tokensIn).toBe(0);
    expect(result.tokensOut).toBe(0);
    expect(result.costUsd).toBe(0);
  });

  it('runs normally when the summary is healthy (fxDegraded: false)', async () => {
    const { useCase, llmClient } = buildUseCase({ portfolioSummary: fakeHealthySummary() });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.status).toBe('completed');
    expect(llmClient.submitAnalysis).toHaveBeenCalledTimes(1);
    // The prompt still carries the real MEP rate line.
    const { userMessage } = llmClient.submitAnalysis.mock.calls[0][0];
    expect(userMessage).toContain('## mepRate');
    expect(userMessage).toContain('1450 (as of 2026-05-15)');
  });
});
