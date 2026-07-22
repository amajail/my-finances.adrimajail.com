/**
 * GenerateWeeklyAnalysis — feature 015 token-diet v2 input trims.
 *   - `## previousAnalysis` drops the prior macro panel, keeps summary + orders (FR-003).
 *   - `## macroContext` omits unavailable indicators (FR-004); no-op when all available.
 * Plus a preamble check for the strengthened interpret-not-restate rule (FR-001).
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');
const WeeklyAnalysis = require('../../../../../src/domain/entities/WeeklyAnalysis');
const { GUARDRAIL_PREAMBLE } = require('../../../../../src/application/use-cases/analysis/prompts/guardrails');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);
const INSTRUCTIONS = '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, framework — inline.';

const macro = (over = {}) => ({
  riesgoPais: { value: 524, asOf: '2026-06-20', available: true },
  fxGap: { value: 1.2, asOf: '2026-06-19', available: true },
  usaInflation: { value: 3.1, asOf: '2026-06-01', available: true },
  imfReviewStatus: { value: 'approved', asOf: '2026-06-10', available: true },
  ...over,
});

function summary() {
  return {
    grandTotalUsd: 9000, totalByCurrency: { USD: 9000, ARS: 0 },
    unrealizedPnlByCurrency: { USD: 0, ARS: 0 }, costBasisByCurrency: { USD: 9000, ARS: 0 },
    mepRate: 1450, mepRateAsOf: '2026-06-20', topPerformers: [], bottomPerformers: [],
    positions: [{ brokerId: 'ibkr', assetType: 'etf', symbol: 'FUNDX', quantity: 10, averageCost: 100, currentPrice: 110, currency: 'USD', valueUsd: 6000, status: 'open' }],
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

function buildUseCase({ repository = mockRepoEmpty(), readings = macro() } = {}) {
  let nowMs = new Date('2026-06-20T21:00:00Z').getTime();
  return {
    repository,
    useCase: new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: { submitAnalysis: jest.fn().mockResolvedValue({ summary: 'Executive summary that is long enough to validate fine.', markdownBody: longBody, orders: [], usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 } }) },
      macroContextProvider: { getLatest: jest.fn().mockResolvedValue({ readings, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }) },
      getPortfolioSummary: { execute: jest.fn().mockResolvedValue(summary()) },
      settingsRepository: { get: jest.fn().mockResolvedValue(null) },
      instructionsRepository: { getActive: jest.fn().mockResolvedValue({ content: INSTRUCTIONS, historyRowKey: 'rk', updatedAt: '2026-06-20T14:00:00Z' }) },
      clock: () => new Date(nowMs++),
    }),
  };
}

function priorWithMacroAndOrder(repo) {
  const prior = new WeeklyAnalysis({
    date: '2026-06-13', status: 'completed', generatedAt: '2026-06-13T21:00:00Z',
    modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v1',
    summary: 'PRIOR_SUMMARY_MARKER — last week we trimmed and held the core ok.',
    markdownBody: longBody, portfolioSnapshot: [],
    macroContext: macro({ riesgoPais: { value: 540, asOf: '2026-06-13', available: true } }), // distinctive prior value
    tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  });
  repo.getLatest.mockResolvedValue([prior]);
  repo.getByDate.mockResolvedValue({ analysis: prior, orders: [{ broker: 'ibkr', symbol: 'PRIORORD', side: 'sell', quantity: 1, rationale: 'prior order rationale long enough', conviction: 'medium', executionStatus: 'executed' }] });
  return repo;
}

describe('GenerateWeeklyAnalysis — feature 015 token-diet v2', () => {
  it('FR-003: previousAnalysis drops the prior macro panel but keeps summary + orders', async () => {
    const repo = priorWithMacroAndOrder(mockRepoEmpty());
    const { useCase } = buildUseCase({ repository: repo });
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });

    const userMessage = llm.submitAnalysis.mock.calls[0][0].userMessage;
    const prevBlock = userMessage.split('## previousAnalysis')[1].split('## macroContext')[0];
    // Prior macro panel gone: the distinctive prior value 540 is absent.
    expect(userMessage).not.toContain('540');
    // Continuity kept: prior summary + prior order survive in the previousAnalysis block.
    expect(prevBlock).toContain('PRIOR_SUMMARY_MARKER');
    expect(prevBlock).toContain('PRIORORD');
    expect(prevBlock).toContain('"executionStatus":"executed"');
  });

  it('FR-004: macroContext omits indicators flagged unavailable', async () => {
    const readings = macro({ fxGap: { value: null, asOf: null, available: false } });
    const { useCase } = buildUseCase({ readings });
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });

    const userMessage = llm.submitAnalysis.mock.calls[0][0].userMessage;
    const macroBlock = userMessage.split('## macroContext')[1];
    expect(macroBlock).not.toContain('"fxGap"');     // unavailable → omitted
    expect(macroBlock).toContain('"riesgoPais"');     // available → kept
  });

  it('FR-004 no-op: when all indicators are available, none are omitted', async () => {
    const { useCase } = buildUseCase({ readings: macro() });
    const llm = useCase._llmClient;
    await useCase.execute({ targetDate: '2026-06-20' });
    const macroBlock = llm.submitAnalysis.mock.calls[0][0].userMessage.split('## macroContext')[1];
    for (const k of ['riesgoPais', 'fxGap', 'usaInflation', 'imfReviewStatus']) {
      expect(macroBlock).toContain(`"${k}"`);
    }
  });

  it('FR-001: the fixed preamble forbids restating the deterministic tables and requires keeping sections', async () => {
    // Enumerates the deterministic sections (incl. 012/013/014) ...
    expect(GUARDRAIL_PREAMBLE).toMatch(/macro week-over-week/i);
    expect(GUARDRAIL_PREAMBLE).toMatch(/duplicate holdings/i);
    expect(GUARDRAIL_PREAMBLE).toMatch(/administrative/i);
    // ... and still guards the required output sections — since guardrail-v2
    // the section names come from the instructions document, not the preamble.
    expect(GUARDRAIL_PREAMBLE).toMatch(/every output section the instructions below\s+define/i);
    expect(GUARDRAIL_PREAMBLE).toMatch(/never means dropping a required\s+section/i);
  });
});
