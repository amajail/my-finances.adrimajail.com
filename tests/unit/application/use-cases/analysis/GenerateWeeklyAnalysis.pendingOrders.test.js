/**
 * GenerateWeeklyAnalysis — feature 020 stale / unrecorded order handling.
 *
 * Pins: prior pending orders (age, status) reach the model; repeats within the
 * limit are saved with ageWeeks; an order already pending in 3 consecutive weeks
 * (or with a visible fill) is never saved as a normal order and becomes a
 * confirmation item that persists until the owner records an outcome; the
 * first run and storage failures degrade gracefully. (Privacy: placeholders only.)
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);
const INSTRUCTIONS = '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, framework — inline.';
const TARGET = '2026-06-27';

const summary = () => ({
  grandTotalUsd: 9000,
  totalByCurrency: { USD: 9000, ARS: 0 },
  unrealizedPnlByCurrency: { USD: 0, ARS: 0 },
  costBasisByCurrency: { USD: 9000, ARS: 0 },
  mepRate: 1450, mepRateAsOf: '2026-06-20',
  topPerformers: [], bottomPerformers: [],
  positions: [
    { brokerId: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000, status: 'open' },
    { brokerId: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000, status: 'open' },
  ],
});

const llmOrder = (over = {}) => ({
  broker: 'ibkr', symbol: 'FUNDX', side: 'buy', quantity: 5, conviction: 'low',
  rationale: 'Continue building the underweight sleeve toward its target allocation.', ...over,
});
const storedOrder = (over = {}) => ({
  index: 0, broker: 'ibkr', symbol: 'FUNDX', side: 'buy', quantity: 5, executionStatus: 'pending', ...over,
});

// weeks: [{ date, orders?, confirmationItems?, positionChanges?, portfolioSnapshot?, status? }] newest first.
function repoWith(weeks) {
  const byDate = new Map(weeks.map((w) => [w.date, w]));
  return {
    getLatest: jest.fn().mockResolvedValue(weeks.map((w) => ({ date: w.date, status: w.status || 'completed' }))),
    getByDate: jest.fn(async (date) => {
      const w = byDate.get(date);
      if (!w) return null;
      return {
        analysis: {
          date, status: w.status || 'completed', summary: 'Prior summary', markdownBody: longBody,
          portfolioSnapshot: w.portfolioSnapshot || [], macroContext: null,
          positionChanges: w.positionChanges === undefined ? [] : w.positionChanges,
          confirmationItems: w.confirmationItems || [],
        },
        orders: w.orders || [],
      };
    }),
    upsert: jest.fn().mockResolvedValue(undefined),
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
}

function build({ repository, orders = [] }) {
  let nowMs = new Date('2026-06-27T21:00:00Z').getTime();
  const llmClient = {
    submitAnalysis: jest.fn().mockResolvedValue({
      summary: 'Executive summary: hold the core, nothing to flag this week.',
      markdownBody: longBody,
      orders,
      usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
    }),
  };
  const useCase = new GenerateWeeklyAnalysis({
    analysisRepository: repository,
    llmClient,
    macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings: { riesgoPais: { value: 429, asOf: '2026-06-26', available: true } }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
    getPortfolioSummary: { execute: jest.fn().mockResolvedValue(summary()) },
    settingsRepository: { get: jest.fn().mockResolvedValue(null) },
    instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-06-20T14:00:00Z' }) },
    allocationTargetsRepository: null,
    clock: () => new Date(nowMs++),
  });
  return { useCase, llmClient, repository };
}

const pendingWeeks = (n) => ['2026-06-20', '2026-06-13', '2026-06-06', '2026-05-30', '2026-05-23']
  .slice(0, n).map((date) => ({ date, orders: [storedOrder()] }));

const saved = (repository) => ({ analysis: repository.upsert.mock.calls[0][0], orders: repository.upsert.mock.calls[0][1] });
const promptOf = (llmClient) => llmClient.submitAnalysis.mock.calls[0][0].userMessage;

describe('GenerateWeeklyAnalysis — feature 020 pending orders', () => {
  it('first run: empty pendingOrders block and orders saved unchanged with age 0', async () => {
    const { useCase, llmClient, repository } = build({ repository: repoWith([]), orders: [llmOrder()] });
    await useCase.execute({ targetDate: TARGET });
    expect(promptOf(llmClient)).toMatch(/## pendingOrders\nnone/);
    const { analysis, orders } = saved(repository);
    expect(orders).toHaveLength(1);
    expect(orders[0].ageWeeks).toBe(0);
    expect(analysis.confirmationItems).toEqual([]);
  });

  it('tells the model about a pending prior order with its age and status, and stamps the repeat', async () => {
    const { useCase, llmClient, repository } = build({ repository: repoWith(pendingWeeks(1)), orders: [llmOrder()] });
    await useCase.execute({ targetDate: TARGET });
    const block = promptOf(llmClient).split('## pendingOrders')[1].split('## macroContext')[0];
    expect(block).toContain('"symbol":"FUNDX"');
    expect(block).toContain('"ageWeeks":1');
    expect(block).toContain('"status":"pending"');
    expect(block).toContain('"maxConsecutiveIssues":3');
    const { orders, analysis } = saved(repository);
    expect(orders[0].ageWeeks).toBe(1);
    expect(analysis.confirmationItems).toEqual([]);
  });

  it('2 consecutive pending weeks is still a labelled carry-over (limit is 3)', async () => {
    const { useCase, repository } = build({ repository: repoWith(pendingWeeks(2)), orders: [llmOrder()] });
    await useCase.execute({ targetDate: TARGET });
    const { orders, analysis } = saved(repository);
    expect(orders).toHaveLength(1);
    expect(orders[0].ageWeeks).toBe(2);
    expect(analysis.confirmationItems).toEqual([]);
  });

  it('3 consecutive pending weeks: the repeat is not saved; a confirmation item points at the latest row', async () => {
    const { useCase, repository } = build({ repository: repoWith(pendingWeeks(3)), orders: [llmOrder()] });
    await useCase.execute({ targetDate: TARGET });
    const { orders, analysis } = saved(repository);
    expect(orders).toEqual([]);
    expect(analysis.confirmationItems).toEqual([{
      broker: 'ibkr', symbol: 'FUNDX', side: 'buy', quantity: 5, ageWeeks: 3,
      originDate: '2026-06-06', lastDate: '2026-06-20', lastIndex: 0, reason: 'stale', proposedStatus: null,
    }]);
  });

  it('lists the item even when the model did not repeat the order', async () => {
    const { useCase, repository } = build({ repository: repoWith(pendingWeeks(3)), orders: [] });
    await useCase.execute({ targetDate: TARGET });
    expect(saved(repository).analysis.confirmationItems).toHaveLength(1);
  });

  it('keeps the item (and blocks a repeat) in the weeks after it was escalated, without a 4-week cycle', async () => {
    // Escalated at the 2026-06-20 run: the item points at the last issued row (2026-06-13).
    const item = { broker: 'ibkr', symbol: 'FUNDX', side: 'buy', quantity: 5, ageWeeks: 3, originDate: '2026-05-30', lastDate: '2026-06-13', lastIndex: 0, reason: 'stale', proposedStatus: null };
    const weeks = [
      { date: '2026-06-20', orders: [], confirmationItems: [item] },
      { date: '2026-06-13', orders: [storedOrder()] },
      { date: '2026-06-06', orders: [storedOrder()] },
      { date: '2026-05-30', orders: [storedOrder()] },
    ];
    const { useCase, repository } = build({ repository: repoWith(weeks), orders: [llmOrder()] });
    await useCase.execute({ targetDate: TARGET });
    const { orders, analysis } = saved(repository);
    expect(orders).toEqual([]);
    expect(analysis.confirmationItems).toHaveLength(1);
    expect(analysis.confirmationItems[0]).toMatchObject({ reason: 'stale', ageWeeks: 4, lastDate: '2026-06-13', lastIndex: 0 });
  });

  it('a recorded outcome (even "still wanted" as skipped) ends the chain; a fresh order starts at age 0', async () => {
    const weeks = [
      { date: '2026-06-20', orders: [storedOrder({ executionStatus: 'skipped' })] },
      { date: '2026-06-13', orders: [storedOrder()] },
      { date: '2026-06-06', orders: [storedOrder()] },
    ];
    const { useCase, repository } = build({ repository: repoWith(weeks), orders: [llmOrder()] });
    await useCase.execute({ targetDate: TARGET });
    const { orders, analysis } = saved(repository);
    expect(orders).toHaveLength(1);
    expect(orders[0].ageWeeks).toBe(0);
    expect(analysis.confirmationItems).toEqual([]);
  });

  it('replay of 8 observed pending weeks yields one item and no normal order for the key', async () => {
    const dates = ['2026-06-20', '2026-06-13', '2026-06-06', '2026-05-30', '2026-05-23', '2026-05-16', '2026-05-09', '2026-05-02'];
    const weeks = dates.map((date) => ({ date, orders: [storedOrder()] }));
    const { useCase, repository } = build({ repository: repoWith(weeks), orders: [llmOrder()] });
    await useCase.execute({ targetDate: TARGET });
    const { orders, analysis } = saved(repository);
    expect(orders).toEqual([]);
    expect(analysis.confirmationItems).toHaveLength(1);
    expect(analysis.confirmationItems[0].ageWeeks).toBe(8);
  });

  it('drops only the blocked order and re-indexes the survivors from 0', async () => {
    const other = llmOrder({ symbol: 'CDR', broker: 'iol' });
    const { useCase, repository } = build({ repository: repoWith(pendingWeeks(3)), orders: [llmOrder(), other] });
    await useCase.execute({ targetDate: TARGET });
    const { orders } = saved(repository);
    expect(orders.map((o) => [o.index, o.symbol])).toEqual([[0, 'CDR']]);
  });

  it('is idempotent: running the same date twice gives the same orders and items', async () => {
    const run = async () => {
      const { useCase, repository } = build({ repository: repoWith(pendingWeeks(3)), orders: [llmOrder()] });
      await useCase.execute({ targetDate: TARGET });
      const { orders, analysis } = saved(repository);
      return { orders: orders.map((o) => o.toJSON()), items: analysis.confirmationItems };
    };
    expect(await run()).toEqual(await run());
  });

  it('degrades to no prior orders when storage fails (FR-011)', async () => {
    const repository = repoWith(pendingWeeks(3));
    repository.getLatest.mockRejectedValue(new Error('storage down'));
    const { useCase } = build({ repository, orders: [llmOrder()] });
    const result = await useCase.execute({ targetDate: TARGET });
    expect(result.status).toBe('completed');
    expect(saved(repository).orders).toHaveLength(1);
  });

  describe('probable fills (FR-013)', () => {
    const priorSnapshot = [
      { broker: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 5, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 550 },
      { broker: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000 },
    ];

    it('does not re-issue an order whose fill is visible in this week\'s position changes (even at age 1)', async () => {
      const weeks = [{ date: '2026-06-20', orders: [storedOrder()], portfolioSnapshot: priorSnapshot }];
      const { useCase, repository, llmClient } = build({ repository: repoWith(weeks), orders: [llmOrder()] });
      await useCase.execute({ targetDate: TARGET });
      const { orders, analysis } = saved(repository);
      expect(orders).toEqual([]);
      expect(analysis.confirmationItems).toEqual([expect.objectContaining({ reason: 'likely-filled', proposedStatus: 'executed', ageWeeks: 1, lastDate: '2026-06-20', lastIndex: 0 })]);
      expect(promptOf(llmClient)).toContain('"reason":"likely-filled"');
    });

    it('proposes partial when the visible increase is smaller than the order', async () => {
      const weeks = [{ date: '2026-06-20', orders: [storedOrder({ quantity: 8 })], portfolioSnapshot: priorSnapshot }];
      const { useCase, repository } = build({ repository: repoWith(weeks), orders: [] });
      await useCase.execute({ targetDate: TARGET });
      expect(saved(repository).analysis.confirmationItems[0]).toMatchObject({ reason: 'likely-filled', proposedStatus: 'partial' });
    });
  });
});
