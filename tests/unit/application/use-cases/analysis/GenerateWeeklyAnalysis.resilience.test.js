/**
 * GenerateWeeklyAnalysis — resilience fixes from the 2026-10-28 system assessment:
 *   #9  freeze guard fails closed
 *   #1  post-LLM entity construction failure persists a failed row with cost
 *   #8  failed rows keep already-computed data (earmarked, admin)
 * (Privacy: all fake symbols/values.)
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);

function summary({ fxDegraded = false } = {}) {
  return {
    grandTotalUsd: 19000,
    totalByCurrency: { USD: 19000, ARS: 0 },
    unrealizedPnlByCurrency: { USD: 0, ARS: 0 },
    costBasisByCurrency: { USD: 19000, ARS: 0 },
    mepRate: fxDegraded ? null : 1450, mepRateAsOf: '2026-06-20',
    fxDegraded, fxError: fxDegraded ? 'upstream timeout' : null,
    topPerformers: [], bottomPerformers: [],
    positions: [
      { brokerId: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000, status: 'open' },
      { brokerId: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000, status: 'open' },
      { brokerId: 'cash', assetType: 'cash', symbol: 'RESERVEUSD', quantity: 10000, averageCost: 1, currentPrice: null, currency: 'USD', valueUsd: 10000, status: 'open' },
      { brokerId: 'iol', assetType: 'stock', symbol: 'STUB', quantity: 3, averageCost: 0, currentPrice: null, currency: 'USD', valueUsd: 0, status: 'open' },
    ],
  };
}

function build({ repository, portfolioSummary = summary(), llmResult, instructions = 'INSTRUCTIONS' } = {}) {
  const repo = repository || {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
  const llmClient = {
    submitAnalysis: jest.fn().mockResolvedValue(llmResult || {
      summary: 'Executive summary: hold the core, nothing to flag this week.',
      markdownBody: longBody, orders: [],
      usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.05 },
    }),
  };
  let t = new Date('2026-06-20T21:00:00Z').getTime();
  const useCase = new GenerateWeeklyAnalysis({
    analysisRepository: repo,
    llmClient,
    macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings: { riesgoPais: { value: 429, asOf: '2026-06-20', available: true } }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
    getPortfolioSummary: { execute: jest.fn().mockResolvedValue(portfolioSummary) },
    settingsRepository: { get: jest.fn().mockResolvedValue(null) },
    instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: instructions, historyRowKey: 'rk' }) },
    clock: () => new Date(t++),
  });
  return { useCase, repo, llmClient };
}

describe('GenerateWeeklyAnalysis — resilience', () => {
  it('#9 freeze guard fails closed: a storage error aborts before the LLM or any write', async () => {
    const { useCase, repo, llmClient } = build();
    repo.hasMarkedOrders.mockRejectedValue(new Error('storage unavailable'));

    await expect(useCase.execute({ targetDate: '2026-06-20' })).rejects.toThrow(/freeze-guard check failed/);
    expect(llmClient.submitAnalysis).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('#9 freeze guard fails closed when getByDate errors on a marked week', async () => {
    const { useCase, repo, llmClient } = build();
    repo.hasMarkedOrders.mockResolvedValue(true);
    repo.getByDate.mockRejectedValue(new Error('storage unavailable'));

    await expect(useCase.execute({ targetDate: '2026-06-20' })).rejects.toThrow(/freeze-guard check failed/);
    expect(llmClient.submitAnalysis).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('#1 entity construction failure after the LLM call persists a failed row keeping the cost', async () => {
    const { useCase, repo } = build({
      llmResult: {
        summary: 'x', // too short for WeeklyAnalysis validation
        markdownBody: longBody, orders: [],
        usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.05 },
      },
    });

    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/rejected after LLM call/);
    expect(result.costUsd).toBe(0.05);
    expect(result.tokensIn).toBe(1000);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert.mock.calls[0][0].status).toBe('failed');
    expect(repo.upsert.mock.calls[0][1]).toEqual([]);
  });

  it('#8 FX-degraded failed row keeps the earmarked reserve', async () => {
    const { useCase } = build({ portfolioSummary: summary({ fxDegraded: true }) });
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.status).toBe('failed');
    expect(result.earmarkedPositions.map((p) => p.symbol)).toEqual(['RESERVEUSD']);
  });

  it('#8 instructions-missing failed row keeps administrative and earmarked positions', async () => {
    const { useCase } = build({ instructions: '   ' });
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/instructions not configured/);
    expect(result.earmarkedPositions.map((p) => p.symbol)).toEqual(['RESERVEUSD']);
    expect(result.administrativePositions.map((p) => p.symbol)).toEqual(['STUB']);
  });
});
