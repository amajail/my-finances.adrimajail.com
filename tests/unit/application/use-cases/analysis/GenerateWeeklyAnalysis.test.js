/**
 * GenerateWeeklyAnalysis use-case tests.
 *
 * Mocks all collaborators. Covers (feature 002 + 005 + 006):
 *   - instructions document used VERBATIM as the system prompt (005)
 *   - LLM result materialized into WeeklyAnalysis + SuggestedOrder entities
 *   - macro panel captured/injected/mirrored + resilient (006 US1)
 *   - portfolio totals captured + preserved on failure (006 US2)
 *   - exact week-over-week position changes (006 US3)
 *   - prior macro panel reaches the prompt for trend reasoning (006 US4)
 *   - failure branches persist a failed row (and re-throw for unknowns)
 *   - no log call contains the prompt body or the raw response body
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');
const WeeklyAnalysis = require('../../../../../src/domain/entities/WeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);

const DEFAULT_INSTRUCTIONS =
  '# FULL INSTRUCTIONS DOCUMENT\n\nRole, guardrails, and the owner framework — all inline as one document.';

function fakePortfolioSummary() {
  return {
    grandTotalUsd: 100000,
    totalByCurrency: { USD: 90000, ARS: 14500000 },
    unrealizedPnlByCurrency: { USD: 1200, ARS: -50000 },
    costBasisByCurrency: { USD: 88800, ARS: 14550000 },
    mepRate: 1450,
    mepRateAsOf: '2026-05-15',
    topPerformers: [{ symbol: 'BRK.B', pnlPct: 14.3 }],
    bottomPerformers: [{ symbol: 'GD41D', pnlPct: -3.1 }],
    positions: [
      {
        brokerId: 'ibkr', assetType: 'stock', symbol: 'BRK.B',
        quantity: 10, averageCost: 350, currentPrice: 400,
        currency: 'USD', valueUsd: 4000, status: 'open',
      },
      {
        brokerId: 'galicia', assetType: 'bond', symbol: 'GD41D',
        quantity: 50, averageCost: 55, currentPrice: 62,
        currency: 'USD', valueUsd: 3100, status: 'open',
      },
    ],
  };
}

// A fully-available macro panel (the orchestrator never throws — a failing
// source surfaces as available:false, not an exception).
function fakeMacroReadings(overrides = {}) {
  return {
    riesgoPais: { value: 524, asOf: '2026-05-15', available: true },
    fxGap: { value: 0.3, asOf: '2026-05-14', available: true },
    bcraReserves: { value: 47834, asOf: '2026-05-13', available: true, basis: 'gross' },
    argInflation: { value: 2.1, asOf: '2026-04-30', available: true },
    argInterestRate: { value: 29, asOf: '2026-05-15', available: true },
    usaInflation: { value: 3.1, asOf: '2026-04-01', available: true },
    usaInterestRate: { value: 4.5, asOf: '2026-05-15', available: true },
    sp500Drawdown: { value: -2.4, asOf: '2026-05-15', available: true },
    imfReviewStatus: { value: 'approved', asOf: '2026-05-10', available: true },
    ...overrides,
  };
}

function mockMacroProvider({ readings = fakeMacroReadings(), usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 } } = {}) {
  return { getLatest: jest.fn().mockResolvedValue({ readings, usage }) };
}

function mockRepositoryEmpty() {
  return {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    // Feature 007: freeze guard — default unmarked.
    hasMarkedOrders: jest.fn().mockResolvedValue(false),
  };
}

function mockLlmClientReturning(orders = []) {
  return {
    submitAnalysis: jest.fn().mockResolvedValue({
      summary: 'Executive summary: trim MU, add BRK.B, hold the rest.',
      markdownBody: longBody,
      orders,
      usage: { inputTokens: 12000, outputTokens: 1500, costUsd: 0.30 },
    }),
  };
}

function mockSettingsRepo(map = {}) {
  return { get: jest.fn(async (key) => (key in map ? map[key] : null)) };
}

function mockInstructionsRepo({ content = DEFAULT_INSTRUCTIONS, historyRowKey = 'rk-active', updatedAt = '2026-06-11T14:00:00Z' } = {}) {
  return { getActive: jest.fn(async () => ({ content, historyRowKey, updatedAt })) };
}

function buildUseCase({
  llmClient = mockLlmClientReturning(),
  repository = mockRepositoryEmpty(),
  macroContextProvider = mockMacroProvider(),
  settingsRepository = mockSettingsRepo({ 'analysis.model': 'claude-opus-4-7' }),
  instructionsRepository = mockInstructionsRepo(),
  portfolioSummary = fakePortfolioSummary(),
  fixedNow = new Date('2026-05-15T21:00:00Z'),
} = {}) {
  let nowMs = fixedNow.getTime();
  const clock = () => new Date(nowMs++); // advances by 1ms so duration > 0
  return {
    useCase: new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient,
      macroContextProvider,
      getPortfolioSummary: { execute: jest.fn().mockResolvedValue(portfolioSummary) },
      settingsRepository,
      instructionsRepository,
      clock,
    }),
    repository,
    llmClient,
    settingsRepository,
    instructionsRepository,
    macroContextProvider,
  };
}

describe('GenerateWeeklyAnalysis (happy path)', () => {
  it('produces a completed WeeklyAnalysis and persists it with the new orders', async () => {
    const orders = [
      { broker: 'ibkr', symbol: 'MU', side: 'sell', quantity: 25, conviction: 'medium',
        rationale: 'Standing TRIM directive: chip-sector concentration.' },
      { broker: 'galicia', symbol: 'GD41D', side: 'buy', quantity: 12, conviction: 'medium',
        rationale: 'Riesgo país 524 < 600 bp; ARG bucket default deploy target. Per-100-nominales applies.' },
    ];
    const { useCase, repository, llmClient } = buildUseCase({
      llmClient: mockLlmClientReturning(orders),
    });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result).toBeInstanceOf(WeeklyAnalysis);
    expect(result.status).toBe('completed');
    expect(result.date).toBe('2026-05-15');
    expect(result.modelUsed).toBe('claude-opus-4-7');
    expect(result.promptVersion).toBe('editable-instructions-v1+guardrail-v2');
    expect(result.instructionsHistoryRowKey).toBe('rk-active');
    expect(result.tokensIn).toBe(12000);
    expect(result.tokensOut).toBe(1500);
    expect(result.costUsd).toBeCloseTo(0.30);
    expect(result.riesgoPaisBp).toBe(524);
    expect(result.portfolioSnapshot.length).toBe(2);

    expect(llmClient.submitAnalysis).toHaveBeenCalledTimes(1);
    expect(repository.upsert).toHaveBeenCalledTimes(1);
    const [persisted, persistedOrders] = repository.upsert.mock.calls[0];
    expect(persisted.status).toBe('completed');
    expect(persistedOrders).toHaveLength(2);
    expect(persistedOrders[0].symbol).toBe('MU');
    expect(persistedOrders[1].symbol).toBe('GD41D');
    expect(persistedOrders[1].index).toBe(1);
  });

  it('uses the settings-driven model', async () => {
    const { useCase, llmClient } = buildUseCase({
      settingsRepository: mockSettingsRepo({ 'analysis.model': 'claude-sonnet-4-6' }),
    });
    await useCase.execute({ targetDate: '2026-05-15' });

    expect(llmClient.submitAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
    );
  });

  it('falls back to default model / caps when those settings are missing', async () => {
    const { useCase, llmClient } = buildUseCase({ settingsRepository: mockSettingsRepo({}) });
    await useCase.execute({ targetDate: '2026-05-15' });

    expect(llmClient.submitAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-7', maxInputTokens: 80000, maxOutputTokens: 8000 })
    );
  });

  it('passes previousAnalysis: null when no prior row exists (first run)', async () => {
    const { useCase, llmClient } = buildUseCase();
    await useCase.execute({ targetDate: '2026-05-15' });

    const submitCall = llmClient.submitAnalysis.mock.calls[0][0];
    expect(submitCall.userMessage).toContain('## previousAnalysis');
    expect(submitCall.userMessage).toContain('none — first run');
  });

  it('uses the active instructions body verbatim, prefixed by the fixed guardrail preamble (FR-014)', async () => {
    const { GUARDRAIL_PREAMBLE } = require('../../../../../src/application/use-cases/analysis/prompts/guardrails');
    const content = '### MY OWNER INSTRUCTIONS\n- bucket-X: [SYMBOL_REDACTED]\n- directive: HOLD [WHATEVER]';
    const { useCase, llmClient, instructionsRepository } = buildUseCase({
      instructionsRepository: mockInstructionsRepo({ content }),
    });
    await useCase.execute({ targetDate: '2026-05-15' });

    expect(instructionsRepository.getActive).toHaveBeenCalledTimes(1);
    const submitCall = llmClient.submitAnalysis.mock.calls[0][0];
    // Effective prompt = preamble ⊕ body: preamble first, body verbatim after.
    expect(submitCall.systemPrompt.startsWith(GUARDRAIL_PREAMBLE)).toBe(true);
    expect(submitCall.systemPrompt.endsWith(content)).toBe(true);
    expect(submitCall.systemPrompt).toContain(content);
  });

  it('persists a failed row when no active instructions document exists', async () => {
    const repo = mockRepositoryEmpty();
    const { useCase } = buildUseCase({
      repository: repo,
      instructionsRepository: { getActive: jest.fn().mockResolvedValue(null) },
    });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/instructions not configured/);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert.mock.calls[0][1]).toEqual([]);
  });

  it('does not log the prompt body or the response body', async () => {
    const logger = require('../../../../../src/shared/logging');
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    const { useCase } = buildUseCase({ llmClient: mockLlmClientReturning([]) });
    await useCase.execute({ targetDate: '2026-05-15' });

    const allLogArgs = [...spy.mock.calls.flat(), ...warnSpy.mock.calls.flat()];
    const asJson = JSON.stringify(allLogArgs);
    expect(asJson).not.toContain('FULL INSTRUCTIONS DOCUMENT');
    expect(asJson).not.toContain('Executive summary: trim MU');
    expect(asJson).not.toContain(longBody.slice(0, 30));

    spy.mockRestore();
    warnSpy.mockRestore();
  });
});

// =========================================================================
// Feature 006 — US1: macro context captured, used, mirrored, resilient
// =========================================================================
describe('GenerateWeeklyAnalysis (US1 macro context)', () => {
  it('persists the macro panel, injects it, and mirrors riesgo país onto legacy fields', async () => {
    const { useCase, repository, llmClient } = buildUseCase();
    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.macroContext).toBeTruthy();
    expect(result.macroContext.imfReviewStatus.value).toBe('approved');
    expect(result.macroContext.bcraReserves.basis).toBe('gross');
    expect(result.riesgoPaisBp).toBe(524);
    expect(result.riesgoPaisAsOf).toBe('2026-05-15');

    const submitCall = llmClient.submitAnalysis.mock.calls[0][0];
    expect(submitCall.userMessage).toContain('## macroContext');
    expect(submitCall.userMessage).toContain('"imfReviewStatus"');

    const persisted = repository.upsert.mock.calls[0][0];
    expect(persisted.macroContext.usaInflation.value).toBe(3.1);
  });

  it('folds the IMF classify usage into run telemetry and cost (FR-022)', async () => {
    const macroContextProvider = mockMacroProvider({ usage: { inputTokens: 200, outputTokens: 20, costUsd: 0.0003 } });
    const { useCase } = buildUseCase({ macroContextProvider });
    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.tokensIn).toBe(12200);   // 12000 + 200
    expect(result.tokensOut).toBe(1520);   // 1500 + 20
    expect(result.costUsd).toBeCloseTo(0.3003, 4);
  });

  it('completes the run even when a macro source (riesgo país) is unavailable (SC-002)', async () => {
    const readings = fakeMacroReadings({ riesgoPais: { value: null, asOf: null, available: false } });
    const { useCase, repository } = buildUseCase({ macroContextProvider: mockMacroProvider({ readings }) });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.status).toBe('completed');           // no abort (unlike pre-006)
    expect(result.riesgoPaisBp).toBeNull();            // unavailable → not mirrored
    expect(result.macroContext.riesgoPais.available).toBe(false);
    expect(repository.upsert).toHaveBeenCalledTimes(1);
  });
});

// =========================================================================
// Feature 006 — US2: portfolio totals captured + preserved on failure
// =========================================================================
describe('GenerateWeeklyAnalysis (US2 portfolio totals)', () => {
  it('captures the run-time totals from the portfolio summary', async () => {
    const { useCase } = buildUseCase();
    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.portfolioTotals).toMatchObject({
      totalUsd: 90000,
      totalArs: 14500000,
      grandTotalUsd: 100000,
      unrealizedPnlUsd: 1200,
      unrealizedPnlArs: -50000,
      mepRate: 1450,
      mepRateAsOf: '2026-05-15',
    });
  });

  it('preserves totals on a failed run (FR-014)', async () => {
    const repo = mockRepositoryEmpty();
    const llmClient = { submitAnalysis: jest.fn().mockRejectedValue(new LLMSchemaValidationError('bad shape')) };
    const { useCase } = buildUseCase({ repository: repo, llmClient });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.status).toBe('failed');
    expect(result.portfolioTotals).toBeTruthy();
    expect(result.portfolioTotals.totalUsd).toBe(90000);
    expect(result.macroContext).toBeTruthy();          // macro also preserved
  });
});

// =========================================================================
// Feature 006 — US3: exact position changes
// =========================================================================
describe('GenerateWeeklyAnalysis (US3 position changes)', () => {
  function priorWith(snapshot) {
    const prior = new WeeklyAnalysis({
      date: '2026-05-08', status: 'completed', generatedAt: '2026-05-08T21:00:14Z',
      modelUsed: 'claude-opus-4-7', promptVersion: 'editable-instructions-v1',
      summary: 'Prior week summary — concise paragraph about last week.', markdownBody: longBody,
      portfolioSnapshot: snapshot, tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    const repo = mockRepositoryEmpty();
    repo.getLatest.mockResolvedValue([prior]);
    repo.getByDate.mockResolvedValue({ analysis: prior, orders: [] });
    return repo;
  }

  it('positionChanges === null on the first run (no prior snapshot)', async () => {
    const { useCase } = buildUseCase();
    const result = await useCase.execute({ targetDate: '2026-05-15' });
    expect(result.positionChanges).toBeNull();
  });

  it('computes added/removed exactly vs the prior snapshot', async () => {
    // Prior held MU (gone now); current holds BRK.B + GD41D (both new).
    const repo = priorWith([
      { broker: 'ibkr', assetType: 'stock', symbol: 'MU', quantity: 50, averageCost: 80, currentPrice: 100, currency: 'USD', valueUsd: 5000 },
    ]);
    const { useCase } = buildUseCase({ repository: repo });
    const result = await useCase.execute({ targetDate: '2026-05-15' });

    const bySymbol = Object.fromEntries(result.positionChanges.map((c) => [c.symbol, c]));
    expect(bySymbol.MU.change).toBe('removed');
    expect(bySymbol['BRK.B'].change).toBe('added');
    expect(bySymbol.GD41D.change).toBe('added');
    expect(result.positionChanges).toHaveLength(3);
  });

  it('reports [] when only price moved (no quantity change)', async () => {
    // Prior snapshot has the SAME quantities as the current portfolio, different prices.
    const repo = priorWith([
      { broker: 'ibkr', assetType: 'stock', symbol: 'BRK.B', quantity: 10, averageCost: 350, currentPrice: 999, currency: 'USD', valueUsd: 9990 },
      { broker: 'galicia', assetType: 'bond', symbol: 'GD41D', quantity: 50, averageCost: 55, currentPrice: 1, currency: 'USD', valueUsd: 50 },
    ]);
    const { useCase } = buildUseCase({ repository: repo });
    const result = await useCase.execute({ targetDate: '2026-05-15' });
    expect(result.positionChanges).toEqual([]);
  });

  it('preserves computed positionChanges on a failed run (FR-014)', async () => {
    const repo = priorWith([
      { broker: 'ibkr', assetType: 'stock', symbol: 'MU', quantity: 50, averageCost: 80, currentPrice: 100, currency: 'USD', valueUsd: 5000 },
    ]);
    repo.upsert.mockResolvedValue(undefined);
    const llmClient = { submitAnalysis: jest.fn().mockRejectedValue(new LLMRequestError({ message: 'boom' })) };
    const { useCase } = buildUseCase({ repository: repo, llmClient });

    const result = await useCase.execute({ targetDate: '2026-05-15' });
    expect(result.status).toBe('failed');
    expect(Array.isArray(result.positionChanges)).toBe(true);
    expect(result.positionChanges.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// Feature 006 — US4: prior macro panel reaches the prompt (trend reasoning)
// =========================================================================
describe('GenerateWeeklyAnalysis (US4 trend context)', () => {
  it('threads the prior IMF reading for carry-forward; feature 015 drops the prior macro panel from the prompt', async () => {
    const prior = new WeeklyAnalysis({
      date: '2026-05-08', status: 'completed', generatedAt: '2026-05-08T21:00:14Z',
      modelUsed: 'claude-opus-4-7', promptVersion: 'editable-instructions-v1',
      summary: 'Prior week summary — concise paragraph.', markdownBody: longBody,
      portfolioSnapshot: [],
      macroContext: fakeMacroReadings({ riesgoPais: { value: 540, asOf: '2026-05-08', available: true } }),
      tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    const repo = mockRepositoryEmpty();
    repo.getLatest.mockResolvedValue([prior]);
    repo.getByDate.mockResolvedValue({ analysis: prior, orders: [] });

    const macroContextProvider = mockMacroProvider();
    const { useCase, llmClient } = buildUseCase({ repository: repo, macroContextProvider });
    await useCase.execute({ targetDate: '2026-05-15' });

    // Feature 015 (FR-003): the prior macro panel is NO LONGER fed into the
    // prompt (the deterministic macro week-over-week comparison covers it). The
    // prior riesgo-país value 540 must not appear via previousAnalysis. The
    // CURRENT panel (524) is still present in the `## macroContext` block.
    const submitCall = llmClient.submitAnalysis.mock.calls[0][0];
    expect(submitCall.userMessage).not.toContain('540');
    expect(submitCall.userMessage).toContain('## macroContext');
    expect(submitCall.userMessage).toContain('524'); // current riesgo país
    // Prior IMF reading is still threaded to the orchestrator for carry-forward
    // (a separate mechanism from the prompt panel).
    expect(macroContextProvider.getLatest).toHaveBeenCalledWith(
      expect.objectContaining({ priorImfReading: expect.objectContaining({ value: 'approved' }) })
    );
  });

  it('tolerates a pre-feature prior analysis with no macro (passes null priorImfReading)', async () => {
    const prior = new WeeklyAnalysis({
      date: '2026-05-08', status: 'completed', generatedAt: '2026-05-08T21:00:14Z',
      modelUsed: 'claude-opus-4-7', promptVersion: 'editable-instructions-v1',
      summary: 'Pre-feature prior, no macro panel here.', markdownBody: longBody,
      portfolioSnapshot: [], tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    const repo = mockRepositoryEmpty();
    repo.getLatest.mockResolvedValue([prior]);
    repo.getByDate.mockResolvedValue({ analysis: prior, orders: [] });

    const macroContextProvider = mockMacroProvider();
    const { useCase } = buildUseCase({ repository: repo, macroContextProvider });
    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.status).toBe('completed');
    expect(macroContextProvider.getLatest).toHaveBeenCalledWith({ priorImfReading: null });
  });
});

// =========================================================================
// Failure-branch coverage (riesgo país is NO LONGER fatal — see US1 SC-002)
// =========================================================================
const {
  CostCapExceededError,
  LLMSchemaValidationError,
  LLMRequestError,
} = require('../../../../../src/infrastructure/llm/AnthropicLLMClient');

// =========================================================================
// Feature 007 — freeze guard (US1) + execution-status feed (US2)
// =========================================================================
describe('GenerateWeeklyAnalysis (007 freeze guard + status feed)', () => {
  it('skips the run and returns the existing analysis when the week is frozen (FR-004)', async () => {
    const repo = mockRepositoryEmpty();
    repo.hasMarkedOrders.mockResolvedValue(true);
    const existing = new WeeklyAnalysis({
      date: '2026-05-15', status: 'completed', generatedAt: '2026-05-15T21:00:00Z',
      modelUsed: 'claude-opus-4-7', promptVersion: 'editable-instructions-v1',
      summary: 'Existing analysis that must be preserved, untouched, intact ok.',
      markdownBody: longBody, tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    repo.getByDate.mockResolvedValue({ analysis: existing, orders: [] });

    const { useCase, llmClient } = buildUseCase({ repository: repo });
    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result).toBe(existing);
    expect(llmClient.submitAnalysis).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("feeds each prior order's execution status to the model (FR-009)", async () => {
    const repo = mockRepositoryEmpty();
    const prior = new WeeklyAnalysis({
      date: '2026-05-08', status: 'completed', generatedAt: '2026-05-08T21:00:00Z',
      modelUsed: 'claude-opus-4-7', promptVersion: 'editable-instructions-v1',
      summary: 'Prior week summary paragraph that is long enough to validate ok.',
      markdownBody: longBody, portfolioSnapshot: [], tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    repo.getLatest.mockResolvedValue([prior]);
    repo.getByDate.mockResolvedValue({
      analysis: prior,
      orders: [{ broker: 'ibkr', symbol: 'MU', side: 'sell', quantity: 25, rationale: 'trim chip concentration per directive', conviction: 'medium', executionStatus: 'skipped' }],
    });

    const { useCase, llmClient } = buildUseCase({ repository: repo });
    await useCase.execute({ targetDate: '2026-05-15' });

    const userMessage = llmClient.submitAnalysis.mock.calls[0][0].userMessage;
    // Feature 011: blocks are compact-serialized (no pretty-print spacing).
    expect(userMessage).toContain('"executionStatus":"skipped"');
  });
});

describe('GenerateWeeklyAnalysis user message — feature 011 token diet', () => {
  it('drops the portfolioTotals block in favor of a one-line mepRate, omits performers, and uses compact JSON', async () => {
    const { useCase, llmClient } = buildUseCase();
    await useCase.execute({ targetDate: '2026-05-15' });
    const userMessage = llmClient.submitAnalysis.mock.calls[0][0].userMessage;

    // portfolioTotals block removed; replaced by a compact mepRate line.
    expect(userMessage).not.toContain('## portfolioTotals');
    expect(userMessage).toContain('## mepRate');
    expect(userMessage).toContain('1450'); // mep rate value (one-liner)

    // best/worst performers stripped from the prompt summary.
    expect(userMessage).not.toContain('topPerformers');
    expect(userMessage).not.toContain('bottomPerformers');

    // compact serialization: no 2-space-indented JSON keys.
    expect(userMessage).not.toContain('\n  "');

    // decision-relevant blocks still present (FR-001).
    expect(userMessage).toContain('## currentHoldings');
    expect(userMessage).toContain('## portfolioSummary');
    expect(userMessage).toContain('## macroContext');
  });
});

describe('GenerateWeeklyAnalysis (failure branches)', () => {
  it('CostCapExceededError: persists a failed row', async () => {
    const repo = mockRepositoryEmpty();
    const llmClient = { submitAnalysis: jest.fn().mockRejectedValue(new CostCapExceededError('pre-call estimate 120000 tokens exceeds maxInputTokens=80000')) };
    const { useCase } = buildUseCase({ repository: repo, llmClient });

    const result = await useCase.execute({ targetDate: '2026-05-15' });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/cost cap exceeded: pre-call estimate 120000 tokens/);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert.mock.calls[0][1]).toEqual([]);
  });

  it('LLMSchemaValidationError: persists a failed row with the schema-mismatch reason', async () => {
    const repo = mockRepositoryEmpty();
    const llmClient = { submitAnalysis: jest.fn().mockRejectedValue(new LLMSchemaValidationError('$.orders[0].side: must be one of ["buy","sell"]')) };
    const { useCase } = buildUseCase({ repository: repo, llmClient });

    const result = await useCase.execute({ targetDate: '2026-05-15' });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/tool_use schema validation failed: .*orders\[0\]\.side/);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('LLMRequestError: persists a failed row using the sanitized message (no payload echoed)', async () => {
    const repo = mockRepositoryEmpty();
    const sanitized = { status: 429, errorType: 'rate_limit_error', requestId: 'req_abc', message: 'rate limit exceeded' };
    const llmClient = { submitAnalysis: jest.fn().mockRejectedValue(new LLMRequestError(sanitized)) };
    const { useCase } = buildUseCase({ repository: repo, llmClient });

    const result = await useCase.execute({ targetDate: '2026-05-15' });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/LLM request failed: rate limit exceeded/);
    expect(result.errorMessage).not.toContain('messages');
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('Generic unknown error: persists a failed row AND re-throws', async () => {
    const repo = mockRepositoryEmpty();
    const oops = new Error('some unexpected upstream blowup');
    oops.name = 'WeirdError';
    const llmClient = { submitAnalysis: jest.fn().mockRejectedValue(oops) };
    const { useCase } = buildUseCase({ repository: repo, llmClient });

    await expect(useCase.execute({ targetDate: '2026-05-15' })).rejects.toBe(oops);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    const persisted = repo.upsert.mock.calls[0][0];
    expect(persisted.status).toBe('failed');
    expect(persisted.errorMessage).toMatch(/unexpected error: WeirdError: some unexpected upstream blowup/);
  });
});
