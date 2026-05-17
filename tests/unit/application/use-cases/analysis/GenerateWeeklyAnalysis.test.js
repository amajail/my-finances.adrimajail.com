/**
 * GenerateWeeklyAnalysis use-case tests (happy path).
 *
 * Mocks all collaborators. Asserts:
 *   - prompt is rendered with the settings-driven model/version
 *   - LLM result is materialized into WeeklyAnalysis + SuggestedOrder entities
 *   - repository.upsert is called once with the right shapes
 *   - the persisted entity has status === 'completed'
 *   - no log call contains the prompt body or the raw response body
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');
const WeeklyAnalysis = require('../../../../../src/domain/entities/WeeklyAnalysis');

const longBody = 'This is a long-enough narrative body for validation. '.repeat(10);

function fakePortfolioSummary() {
  return {
    totalUsd: 100000,
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

function mockRepositoryEmpty() {
  return {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
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
  return {
    get: jest.fn(async (key) => map[key] ? { value: map[key] } : null),
  };
}

function buildUseCase({
  llmClient = mockLlmClientReturning(),
  repository = mockRepositoryEmpty(),
  riesgoPaisProvider = { getLatest: jest.fn().mockResolvedValue({ basisPoints: 524, asOf: '2026-05-15' }) },
  settingsRepository = mockSettingsRepo({
    'analysis.model': 'claude-opus-4-7',
    'analysis.promptVersion': 'weekly-rebalance-v1',
    'analysis.strategicFrameworkV1': '## Framework (test fixture)\n- Buckets: US, ARG, OffSystem\n- Targets: US 55%, ARG 30%, OffSystem 15%',
  }),
  portfolioSummary = fakePortfolioSummary(),
  fixedNow = new Date('2026-05-15T21:00:00Z'),
  loadPrompt = jest.fn().mockReturnValue('# SYSTEM PROMPT v1\n\n## Strategic Framework\n\n{{strategicFramework}}\n\n## End\n'),
} = {}) {
  let nowMs = fixedNow.getTime();
  const clock = () => new Date(nowMs++); // advances by 1ms so duration > 0
  return {
    useCase: new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient,
      riesgoPaisProvider,
      getPortfolioSummary: { execute: jest.fn().mockResolvedValue(portfolioSummary) },
      settingsRepository,
      loadPrompt,
      clock,
    }),
    repository,
    llmClient,
    settingsRepository,
    loadPrompt,
    riesgoPaisProvider,
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
    expect(result.promptVersion).toBe('weekly-rebalance-v1');
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

  it('uses settings-driven model + prompt version', async () => {
    const { useCase, llmClient, loadPrompt } = buildUseCase({
      settingsRepository: mockSettingsRepo({
        'analysis.model': 'claude-sonnet-4-6',
        'analysis.promptVersion': 'weekly-rebalance-v1',
        'analysis.strategicFrameworkV1': '## fixture framework',
      }),
    });
    await useCase.execute({ targetDate: '2026-05-15' });

    expect(loadPrompt).toHaveBeenCalledWith('weekly-rebalance-v1');
    expect(llmClient.submitAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
    );
  });

  it('falls back to default model / prompt / caps when those settings are missing (framework still required)', async () => {
    // Only the framework is provided — everything else falls back to defaults.
    const { useCase, llmClient, loadPrompt } = buildUseCase({
      settingsRepository: mockSettingsRepo({
        'analysis.strategicFrameworkV1': '## fixture framework — defaults test',
      }),
    });
    await useCase.execute({ targetDate: '2026-05-15' });

    expect(llmClient.submitAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-7',
        maxInputTokens: 80000,
        maxOutputTokens: 8000,
      })
    );
    expect(loadPrompt).toHaveBeenCalledWith('weekly-rebalance-v1');
  });

  it('passes previousAnalysis: null when no prior row exists (first run)', async () => {
    const { useCase, llmClient } = buildUseCase();
    await useCase.execute({ targetDate: '2026-05-15' });

    const submitCall = llmClient.submitAnalysis.mock.calls[0][0];
    expect(submitCall.userMessage).toContain('## previousAnalysis');
    expect(submitCall.userMessage).toContain('none — first run');
  });

  it('passes a structured previousAnalysis block when a prior row exists', async () => {
    const repo = mockRepositoryEmpty();
    const priorAnalysis = new WeeklyAnalysis({
      date: '2026-05-08',
      status: 'completed',
      generatedAt: '2026-05-08T21:00:14Z',
      modelUsed: 'claude-opus-4-7',
      promptVersion: 'weekly-rebalance-v1',
      summary: 'Prior week summary — concise paragraph about last week.',
      markdownBody: longBody,
      riesgoPaisBp: 538,
      riesgoPaisAsOf: '2026-05-08',
      portfolioSnapshot: [{ broker: 'ibkr', assetType: 'stock', symbol: 'MU', quantity: 50, averageCost: 80, currentPrice: 100, currency: 'USD', valueUsd: 5000 }],
      tokensIn: 10000, tokensOut: 1000, costUsd: 0.20, durationMs: 30000,
    });
    repo.getLatest.mockResolvedValue([priorAnalysis]);
    repo.getByDate.mockResolvedValue({ analysis: priorAnalysis, orders: [] });

    const { useCase, llmClient } = buildUseCase({ repository: repo });
    await useCase.execute({ targetDate: '2026-05-15' });

    const submitCall = llmClient.submitAnalysis.mock.calls[0][0];
    expect(submitCall.userMessage).toContain('## previousAnalysis');
    expect(submitCall.userMessage).toContain('"date": "2026-05-08"');
    expect(submitCall.userMessage).toContain('"portfolioSnapshot"');
    expect(submitCall.userMessage).toContain('"symbol": "MU"');
  });

  it('splices the strategic framework from settings into the {{strategicFramework}} slot', async () => {
    const { useCase, llmClient, settingsRepository } = buildUseCase({
      settingsRepository: mockSettingsRepo({
        'analysis.model': 'claude-opus-4-7',
        'analysis.promptVersion': 'weekly-rebalance-v1',
        'analysis.strategicFrameworkV1': '### MY OWNER FRAMEWORK\n- bucket-X: [SYMBOL_REDACTED]\n- directive: HOLD [WHATEVER]',
      }),
    });
    await useCase.execute({ targetDate: '2026-05-15' });

    expect(settingsRepository.get).toHaveBeenCalledWith('analysis.strategicFrameworkV1');
    const submitCall = llmClient.submitAnalysis.mock.calls[0][0];
    expect(submitCall.systemPrompt).toContain('MY OWNER FRAMEWORK');
    expect(submitCall.systemPrompt).not.toContain('{{strategicFramework}}');
  });

  it('persists a failed row when the strategic framework setting is missing', async () => {
    const repo = mockRepositoryEmpty();
    const { useCase } = buildUseCase({
      repository: repo,
      // No analysis.strategicFrameworkV1 in the settings map.
      settingsRepository: mockSettingsRepo({
        'analysis.model': 'claude-opus-4-7',
        'analysis.promptVersion': 'weekly-rebalance-v1',
      }),
    });

    const result = await useCase.execute({ targetDate: '2026-05-15' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/strategic framework not configured/);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    // No orders persisted on failure
    expect(repo.upsert.mock.calls[0][1]).toEqual([]);
  });

  it('persists a failed row when the strategic framework setting is an empty string', async () => {
    const { useCase } = buildUseCase({
      settingsRepository: mockSettingsRepo({
        'analysis.model': 'claude-opus-4-7',
        'analysis.promptVersion': 'weekly-rebalance-v1',
        'analysis.strategicFrameworkV1': '   \n  ',
      }),
    });

    const result = await useCase.execute({ targetDate: '2026-05-15' });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/strategic framework not configured/);
  });

  it('does not log the prompt body or the response body', async () => {
    const logger = require('../../../../../src/shared/logging');
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    const { useCase } = buildUseCase({
      llmClient: mockLlmClientReturning([]),
    });
    await useCase.execute({ targetDate: '2026-05-15' });

    // Inspect every logged argument; none of them should be the prompt or markdownBody.
    const allLogArgs = [
      ...spy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
    ];
    const asJson = JSON.stringify(allLogArgs);
    expect(asJson).not.toContain('# SYSTEM PROMPT v1');
    expect(asJson).not.toContain('Executive summary: trim MU');
    expect(asJson).not.toContain(longBody.slice(0, 30));

    spy.mockRestore();
    warnSpy.mockRestore();
  });
});
