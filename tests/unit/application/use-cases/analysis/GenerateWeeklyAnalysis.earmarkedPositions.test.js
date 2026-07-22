/**
 * GenerateWeeklyAnalysis — feature 019 earmarked positions.
 *
 * Pins the three-way partition behaviour:
 *   - positions held at an owner-designated earmarked broker with positive
 *     value are classified earmarked and excluded from drift / caps /
 *     duplications / positionChanges (both current and prior sides);
 *   - a zero/negative-value position at an earmarked broker stays
 *     administrative (feature 013), never earmarked (FR-006);
 *   - currentHoldings in the prompt excludes earmarked positions and a
 *     labeled `## earmarkedPositions` block (JSON + totalUsd) is added,
 *     omitted when there are none, with generic instruction text only;
 *   - the broker designation is settings-driven (`analysis.earmarkedBrokers`,
 *     default 'cash') and the field is persisted on the analysis row.
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');
const WeeklyAnalysis = require('../../../../../src/domain/entities/WeeklyAnalysis');
const AllocationDriftCalculator = require('../../../../../src/domain/services/AllocationDriftCalculator');
const DuplicateHoldingsDetector = require('../../../../../src/domain/services/DuplicateHoldingsDetector');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);
const INSTRUCTIONS = '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, framework — inline.';

// Portfolio with: two investable positions, one earmarked-broker cash
// reserve (positive value, default broker 'cash'), one zero-value stub at
// the SAME earmarked broker (must stay administrative, not earmarked).
// (Privacy: all fake symbols/values.)
function summaryWithEarmarked() {
  return {
    grandTotalUsd: 19000,
    totalByCurrency: { USD: 19000, ARS: 0 },
    unrealizedPnlByCurrency: { USD: 0, ARS: 0 },
    costBasisByCurrency: { USD: 19000, ARS: 0 },
    mepRate: 1450, mepRateAsOf: '2026-06-20',
    topPerformers: [], bottomPerformers: [],
    positions: [
      { brokerId: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000, status: 'open' },
      { brokerId: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000, status: 'open' },
      // earmarked reserve — default broker 'cash', positive value
      { brokerId: 'cash', assetType: 'cash', symbol: 'RESERVEUSD', quantity: 10000, averageCost: 1, currentPrice: null, currency: 'USD', valueUsd: 10000, status: 'open' },
      // zero-value position at the SAME earmarked broker → administrative, not earmarked (FR-006)
      { brokerId: 'cash', assetType: 'stock', symbol: 'CASHSTUB', quantity: 3, averageCost: 0, currentPrice: null, currency: 'USD', valueUsd: 0, status: 'open' },
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

// settingsOverrides: { [key]: value } — only 'analysis.earmarkedBrokers' is
// normally overridden here; every other key falls back to the use case's
// built-in default (matching the administrativePositions test convention).
function buildUseCase({ repository = mockRepoEmpty(), portfolioSummary = summaryWithEarmarked(), allocationTargetsRepository = null, settingsOverrides = {} } = {}) {
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
      settingsRepository: { get: jest.fn((key) => Promise.resolve(Object.prototype.hasOwnProperty.call(settingsOverrides, key) ? settingsOverrides[key] : null)) },
      instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-06-20T14:00:00Z' }) },
      allocationTargetsRepository,
      clock: () => new Date(nowMs++),
    }),
    repository,
  };
}

describe('GenerateWeeklyAnalysis — feature 019 earmarked positions', () => {
  it('classifies positive-value earmarked-broker positions as earmarked (default broker "cash")', async () => {
    const { useCase } = buildUseCase();
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.earmarkedPositions.map((p) => p.symbol)).toEqual(['RESERVEUSD']);
    // the zero-value position at the SAME earmarked broker stays administrative (FR-006)
    expect(result.administrativePositions.map((p) => p.symbol)).toEqual(['CASHSTUB']);
    // full snapshot is unfiltered (all four positions retained for the record)
    expect(result.portfolioSnapshot).toHaveLength(4);
  });

  it('persists earmarkedPositions on the analysis row', async () => {
    const { useCase, repository } = buildUseCase();
    await useCase.execute({ targetDate: '2026-06-20' });
    const persisted = repository.upsert.mock.calls[0][0];
    expect(persisted.earmarkedPositions.map((p) => p.symbol)).toEqual(['RESERVEUSD']);
  });

  it('feeds only the investable set (excludes earmarked AND administrative) to drift/caps/duplications', async () => {
    const driftSpy = jest.spyOn(AllocationDriftCalculator, 'computeDrift').mockReturnValue(null);
    const capSpy = jest.spyOn(AllocationDriftCalculator, 'computeConcentrationCaps').mockReturnValue(null);
    const dupSpy = jest.spyOn(DuplicateHoldingsDetector, 'detect').mockReturnValue([]);
    const allocationTargetsRepository = { getActive: jest.fn().mockResolvedValue({ buckets: [] }) };
    const { useCase } = buildUseCase({ allocationTargetsRepository });

    await useCase.execute({ targetDate: '2026-06-20' });

    const expectedSymbols = ['CDR', 'FUNDX'];
    expect(driftSpy.mock.calls[0][0].map((p) => p.symbol).sort()).toEqual(expectedSymbols);
    expect(capSpy.mock.calls[0][0].map((p) => p.symbol).sort()).toEqual(expectedSymbols);
    expect(dupSpy.mock.calls[0][0].map((p) => p.symbol).sort()).toEqual(expectedSymbols);
    driftSpy.mockRestore();
    capSpy.mockRestore();
    dupSpy.mockRestore();
  });

  it('prompt: currentHoldings excludes earmarked positions and a labeled earmarkedPositions block is added', async () => {
    const { useCase } = buildUseCase();
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });

    const userMessage = llm.submitAnalysis.mock.calls[0][0].userMessage;
    expect(userMessage).toContain('## earmarkedPositions');
    expect(userMessage).toContain('"RESERVEUSD"');
    expect(userMessage).toContain('"totalUsd":10000');
    // fixed guardrail language: excluded from invested capital, separate line, never deploy/sell
    expect(userMessage).toMatch(/invested.capital/i);
    expect(userMessage).toMatch(/do not suggest deploying, trimming, or selling/i);
    // FR-009: no hardcoded real-world purpose in the fixed instruction text
    expect(userMessage).not.toMatch(/villa urquiza|property purchase|depto/i);

    // currentHoldings block must NOT contain the earmarked symbol.
    const holdingsBlock = userMessage.split('## earmarkedPositions')[0];
    expect(holdingsBlock).toContain('## currentHoldings');
    expect(holdingsBlock).not.toContain('RESERVEUSD');
    expect(holdingsBlock).toContain('FUNDX');
  });

  it('omits the earmarkedPositions prompt block when there are none', async () => {
    const clean = summaryWithEarmarked();
    clean.positions = clean.positions.filter((p) => p.brokerId !== 'cash');
    const { useCase } = buildUseCase({ portfolioSummary: clean });
    const llm = useCase._llmClient;
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.earmarkedPositions).toEqual([]);
    expect(llm.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## earmarkedPositions');
  });

  it('honors a configured earmarkedBrokers list, reclassifying which broker is earmarked', async () => {
    const s = summaryWithEarmarked();
    // rename the reserve to a different broker; 'cash' broker positions should
    // become ordinary investable/administrative once no longer designated.
    s.positions.find((p) => p.symbol === 'RESERVEUSD').brokerId = 'otherBroker';
    const { useCase } = buildUseCase({
      portfolioSummary: s,
      settingsOverrides: { 'analysis.earmarkedBrokers': 'otherBroker' },
    });

    const result = await useCase.execute({ targetDate: '2026-06-20' });
    expect(result.earmarkedPositions.map((p) => p.symbol)).toEqual(['RESERVEUSD']);
    // the zero-value 'cash' broker stub is no longer at an earmarked broker,
    // but it's still administrative (value <= 0) either way.
    expect(result.administrativePositions.map((p) => p.symbol)).toEqual(['CASHSTUB']);
  });

  it('clearing analysis.earmarkedBrokers (whitespace value) earmarks nothing', async () => {
    // A literal empty string is indistinguishable from "unset" at the settings
    // layer (AzureSettingsRepository collapses both to null) — a single space
    // is the documented way to fully disable earmarking.
    const { useCase } = buildUseCase({ settingsOverrides: { 'analysis.earmarkedBrokers': ' ' } });
    const llm = useCase._llmClient;
    const result = await useCase.execute({ targetDate: '2026-06-20' });

    expect(result.earmarkedPositions).toEqual([]);
    expect(llm.submitAnalysis.mock.calls[0][0].userMessage).not.toContain('## earmarkedPositions');
  });

  it('excludes earmarked positions from positionChanges on both the current and prior side', async () => {
    // Prior week held the reserve too, at a different value; it must not
    // appear as a change row despite the value difference.
    const prior = new WeeklyAnalysis({
      date: '2026-06-13', status: 'completed', generatedAt: '2026-06-13T21:00:00Z',
      modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v2',
      summary: 'Prior week summary paragraph that is long enough to validate ok.',
      markdownBody: longBody,
      portfolioSnapshot: [
        { broker: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000 },
        { broker: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000 },
        { broker: 'cash', assetType: 'cash', symbol: 'RESERVEUSD', quantity: 9000, averageCost: 1, currentPrice: null, currency: 'USD', valueUsd: 9000 },
      ],
      tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    const repo = mockRepoEmpty();
    repo.getLatest.mockResolvedValue([prior]);
    repo.getByDate.mockResolvedValue({ analysis: prior, orders: [] });
    const { useCase } = buildUseCase({ repository: repo });

    const result = await useCase.execute({ targetDate: '2026-06-20' });
    const changed = (result.positionChanges || []).map((c) => c.symbol);
    expect(changed).not.toContain('RESERVEUSD');
  });

  it('excludes a newly-earmarked position from positionChanges (no spurious "added" row)', async () => {
    // Prior week's snapshot predates the reserve being designated earmarked —
    // it should NOT appear as "added" this week now that it's classified out.
    const prior = new WeeklyAnalysis({
      date: '2026-06-13', status: 'completed', generatedAt: '2026-06-13T21:00:00Z',
      modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v2',
      summary: 'Prior week summary paragraph that is long enough to validate ok.',
      markdownBody: longBody,
      portfolioSnapshot: [
        { broker: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000 },
        { broker: 'iol', assetType: 'cedear', symbol: 'CDR', quantity: 5, averageCost: 500, currentPrice: 600, currency: 'USD', valueUsd: 3000 },
      ],
      tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    const repo = mockRepoEmpty();
    repo.getLatest.mockResolvedValue([prior]);
    repo.getByDate.mockResolvedValue({ analysis: prior, orders: [] });
    const { useCase } = buildUseCase({ repository: repo });

    const result = await useCase.execute({ targetDate: '2026-06-20' });
    const changed = (result.positionChanges || []).map((c) => c.symbol);
    expect(changed).not.toContain('RESERVEUSD');
  });
});
