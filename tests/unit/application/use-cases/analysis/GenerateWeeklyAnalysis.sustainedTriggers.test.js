/**
 * GenerateWeeklyAnalysis — feature 021 sustained macro triggers.
 *
 * Pins: the code-computed day counts reach the model right after the macro
 * panel, are saved on the analysis, and degrade to "no history" on an empty or
 * unreadable store. (Privacy: made-up macro numbers only, no holdings.)
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);
const INSTRUCTIONS = '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, framework — inline.';
const TARGET = '2026-06-27';
const CURRENT_AS_OF = '2026-06-26';

const summary = () => ({
  grandTotalUsd: 9000,
  totalByCurrency: { USD: 9000, ARS: 0 },
  unrealizedPnlByCurrency: { USD: 0, ARS: 0 },
  costBasisByCurrency: { USD: 9000, ARS: 0 },
  mepRate: 1450, mepRateAsOf: '2026-06-20',
  topPerformers: [], bottomPerformers: [],
  positions: [
    { brokerId: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 9000, status: 'open' },
  ],
});

const WEEK_DATES = ['2026-06-20', '2026-06-13', '2026-06-06', '2026-05-30', '2026-05-23'];

/** A prior completed analysis with a riesgoPais reading on its own date. */
const week = (date, value, status = 'completed') => ({
  date, status, macroContext: value === null ? null : { riesgoPais: { value, asOf: date, available: true } },
});
const breachWeeks = (n) => WEEK_DATES.slice(0, n).map((d) => week(d, 850));

function repoWith(weeks) {
  return {
    getLatest: jest.fn().mockResolvedValue(weeks),
    getByDate: jest.fn(async (date) => {
      const w = weeks.find((x) => x.date === date);
      if (!w) return null;
      return {
        analysis: { date, status: w.status, summary: 'Prior summary', markdownBody: longBody, portfolioSnapshot: [], macroContext: w.macroContext, positionChanges: [], confirmationItems: [] },
        orders: [],
      };
    }),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
}

function build({ repository, readings = { riesgoPais: { value: 850, asOf: CURRENT_AS_OF, available: true } } }) {
  let nowMs = new Date('2026-06-27T21:00:00Z').getTime();
  const llmClient = {
    submitAnalysis: jest.fn().mockResolvedValue({
      summary: 'Executive summary: hold the core, nothing to flag this week.',
      markdownBody: longBody,
      orders: [],
      usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
    }),
  };
  const useCase = new GenerateWeeklyAnalysis({
    analysisRepository: repository,
    llmClient,
    macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
    getPortfolioSummary: { execute: jest.fn().mockResolvedValue(summary()) },
    settingsRepository: { get: jest.fn().mockResolvedValue(null) },
    instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-06-20T14:00:00Z' }) },
    allocationTargetsRepository: null,
    clock: () => new Date(nowMs++),
  });
  return { useCase, llmClient, repository };
}

const saved = (repository) => repository.upsert.mock.calls[0][0];
const promptOf = (llmClient) => llmClient.submitAnalysis.mock.calls[0][0].userMessage;
const blockOf = (llmClient) => {
  const text = promptOf(llmClient);
  const body = text.split('## sustainedTriggers')[1].split('```json')[1].split('```')[0];
  return JSON.parse(body);
};
const row = (rows, key) => rows.find((r) => r.key === key);

describe('GenerateWeeklyAnalysis — feature 021 sustained triggers', () => {
  it('sends the day counts right after the macro panel and saves them on the analysis', async () => {
    const { useCase, llmClient, repository } = build({ repository: repoWith(breachWeeks(5)) });
    await useCase.execute({ targetDate: TARGET });

    const text = promptOf(llmClient);
    const macroAt = text.indexOf('## macroContext');
    const sustainedAt = text.indexOf('## sustainedTriggers');
    expect(sustainedAt).toBeGreaterThan(macroAt);
    expect(text.slice(macroAt + 3, sustainedAt)).not.toMatch(/\n## /); // directly after, no section between

    const rows = blockOf(llmClient);
    expect(row(rows, 'riesgoPais')).toMatchObject({
      current: 850, asOf: CURRENT_AS_OF, condition: '> 800 bp for 30d', status: 'met', heldDays: 34, durationMet: true,
    });
    expect(text).toContain('Report a trigger FIRED only when `durationMet` is true');

    const stored = saved(repository).sustainedTriggers;
    expect(stored).toHaveLength(3);
    expect(row(stored, 'riesgoPais')).toMatchObject({ status: 'met', heldDays: 34, durationMet: true });
  });

  it('is building, with days remaining, when the breach is recent', async () => {
    const { useCase, llmClient, repository } = build({ repository: repoWith(breachWeeks(2)) });
    await useCase.execute({ targetDate: TARGET });
    expect(row(blockOf(llmClient), 'riesgoPais')).toMatchObject({ status: 'building', heldDays: 13, daysRemaining: 17, durationMet: false });
    expect(row(saved(repository).sustainedTriggers, 'riesgoPais').durationMet).toBe(false);
  });

  it('reports the gross reserves reading as not evaluable and indicators without data as unknown', async () => {
    const readings = {
      riesgoPais: { value: 850, asOf: CURRENT_AS_OF, available: true },
      bcraReserves: { value: -3, asOf: CURRENT_AS_OF, available: true, basis: 'gross' },
    };
    const { useCase, llmClient } = build({ repository: repoWith(breachWeeks(1)), readings });
    await useCase.execute({ targetDate: TARGET });
    const rows = blockOf(llmClient);
    expect(row(rows, 'bcraReserves')).toMatchObject({ status: 'not-evaluable', durationMet: false });
    expect(row(rows, 'bcraReserves').note).toMatch(/gross/);
    expect(row(rows, 'fxGap')).toMatchObject({ status: 'unknown', current: null, durationMet: false });
  });

  it('first run: completes, every satisfying trigger is insufficient-history, none is FIRED', async () => {
    const { useCase, llmClient, repository } = build({ repository: repoWith([]) });
    await useCase.execute({ targetDate: TARGET });
    expect(row(blockOf(llmClient), 'riesgoPais')).toMatchObject({ status: 'insufficient-history', heldDays: 0, durationMet: false });
    const analysis = saved(repository);
    expect(analysis.status).toBe('completed');
    expect(analysis.sustainedTriggers.some((r) => r.durationMet)).toBe(false);
  });

  it('a history read failure degrades to no history without failing the run or leaking content', async () => {
    const repository = repoWith([]);
    repository.getLatest.mockRejectedValue(Object.assign(new Error('table said: secret detail'), { name: 'StorageError' }));
    const { useCase, llmClient } = build({ repository });
    await useCase.execute({ targetDate: TARGET });
    expect(saved(repository).status).toBe('completed');
    expect(row(blockOf(llmClient), 'riesgoPais').status).toBe('insufficient-history');
  });

  it('keeps an unavailable prior week from resetting the streak', async () => {
    const weeks = [week('2026-06-20', 850), week('2026-06-13', null), ...WEEK_DATES.slice(2).map((d) => week(d, 850))];
    const { useCase, llmClient } = build({ repository: repoWith(weeks) });
    await useCase.execute({ targetDate: TARGET });
    expect(row(blockOf(llmClient), 'riesgoPais')).toMatchObject({ status: 'met', heldDays: 34, includesUnknown: true });
  });

  it('ignores failed prior runs and analyses dated on or after the target', async () => {
    const weeks = [week('2026-06-27', 700), week('2026-06-20', 700, 'failed'), ...breachWeeks(0)];
    const { useCase, llmClient } = build({ repository: repoWith(weeks) });
    await useCase.execute({ targetDate: TARGET });
    expect(row(blockOf(llmClient), 'riesgoPais').status).toBe('insufficient-history');
  });

  it('asks for enough history to cover the longest window', async () => {
    const { useCase, repository } = build({ repository: repoWith([]) });
    await useCase.execute({ targetDate: TARGET });
    expect(repository.getLatest).toHaveBeenCalledWith(8);
  });

  it('puts no holdings, quantities or prices in the block', async () => {
    const { useCase, llmClient } = build({ repository: repoWith(breachWeeks(2)) });
    await useCase.execute({ targetDate: TARGET });
    const block = promptOf(llmClient).split('## sustainedTriggers')[1];
    expect(block).not.toMatch(/FUNDX|quantity|averageCost|currentPrice|valueUsd/);
  });
});

describe('GenerateWeeklyAnalysis — feature 021 on failed runs', () => {
  it('keeps the computed rows on a run that fails after the macro step', async () => {
    const repository = repoWith(breachWeeks(2));
    const { useCase, llmClient } = build({ repository });
    llmClient.submitAnalysis.mockRejectedValue(new Error('boom'));
    await expect(useCase.execute({ targetDate: TARGET })).rejects.toThrow('boom'); // persisted, then rethrown
    const failed = saved(repository);
    expect(failed.status).toBe('failed');
    expect(row(failed.sustainedTriggers, 'riesgoPais')).toMatchObject({ status: 'building', heldDays: 13 });
  });
});
