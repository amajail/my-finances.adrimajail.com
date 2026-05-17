/**
 * GenerateWeeklyAnalysis — framework history link (feature 004, FR-014, FR-015).
 *
 * Verifies that when a frameworkRepository is wired in, the use-case:
 *   - reads framework content + historyRowKey in a single call (snapshot-at-start)
 *   - persists frameworkHistoryRowKey on the produced WeeklyAnalysis
 *   - leaves frameworkHistoryRowKey: null when the repo's getActive() returns
 *     pre-feature seed content (historyRowKey: null)
 *
 * These tests live in a dedicated file so the existing GenerateWeeklyAnalysis
 * test suite (which exercises the legacy settings-only path) stays untouched.
 */

const GenerateWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/GenerateWeeklyAnalysis');

function mockRepository() {
  return {
    getLatest: jest.fn().mockResolvedValue([]),
    getByDate: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
}

function mockLlmClient() {
  return {
    submitAnalysis: jest.fn().mockResolvedValue({
      summary: 'Executive summary of the week, covering buckets and conviction.',
      markdownBody: 'A long-enough markdown narrative. '.repeat(20),
      orders: [],
      usage: { inputTokens: 1000, outputTokens: 200, costUsd: 0.05 },
    }),
  };
}

function mockGetPortfolioSummary() {
  return {
    execute: jest.fn().mockResolvedValue({
      totals: { totalUsd: 100000, totalArs: 0 },
      positions: [],
    }),
  };
}

function mockSettingsRepo(map = {}) {
  const defaults = {
    'analysis.model': 'claude-opus-4-7',
    'analysis.promptVersion': 'weekly-rebalance-v1',
  };
  const final = { ...defaults, ...map };
  return { get: jest.fn(async (key) => (key in final ? final[key] : null)) };
}

function mockRiesgoPais() {
  return { getLatest: jest.fn().mockResolvedValue({ basisPoints: 500, asOf: '2026-05-15' }) };
}

function mockLoadPrompt() {
  return jest.fn().mockReturnValue('SYSTEM PROMPT\n\n{{strategicFramework}}\n\nEND');
}

function build({
  frameworkActive = {
    content: '## Framework\n- Buckets: US, ARG',
    historyRowKey: '8284000000000-aaaa',
    updatedAt: '2026-05-17T14:00:00Z',
  },
} = {}) {
  const repository = mockRepository();
  const frameworkRepository = {
    getActive: jest.fn().mockResolvedValue(frameworkActive),
  };
  const useCase = new GenerateWeeklyAnalysis({
    analysisRepository: repository,
    llmClient: mockLlmClient(),
    riesgoPaisProvider: mockRiesgoPais(),
    getPortfolioSummary: mockGetPortfolioSummary(),
    settingsRepository: mockSettingsRepo(),
    frameworkRepository,
    loadPrompt: mockLoadPrompt(),
    clock: () => new Date('2026-05-15T21:00:00Z'),
  });
  return { useCase, repository, frameworkRepository };
}

describe('GenerateWeeklyAnalysis — framework history link (FR-014, FR-015)', () => {
  it('captures historyRowKey from getActive() and persists it on the analysis row', async () => {
    const { useCase, repository, frameworkRepository } = build();

    const analysis = await useCase.execute({ targetDate: '2026-05-15' });

    expect(frameworkRepository.getActive).toHaveBeenCalledTimes(1);
    expect(analysis.frameworkHistoryRowKey).toBe('8284000000000-aaaa');
    expect(repository.upsert).toHaveBeenCalledTimes(1);
    const persistedAnalysis = repository.upsert.mock.calls[0][0];
    expect(persistedAnalysis.frameworkHistoryRowKey).toBe('8284000000000-aaaa');
  });

  it('persists frameworkHistoryRowKey: null for pre-history seeded content', async () => {
    const { useCase, repository } = build({
      frameworkActive: {
        content: 'pre-feature seeded content',
        historyRowKey: null,
        updatedAt: null,
      },
    });

    const analysis = await useCase.execute({ targetDate: '2026-05-15' });

    expect(analysis.frameworkHistoryRowKey).toBeNull();
    const persistedAnalysis = repository.upsert.mock.calls[0][0];
    expect(persistedAnalysis.frameworkHistoryRowKey).toBeNull();
  });

  it('snapshot-at-start: mid-run mutation of getActive() return value does not affect persisted rowKey', async () => {
    // Build with a getActive that returns one value, then mutates after first call.
    const repository = mockRepository();
    let callCount = 0;
    const frameworkRepository = {
      getActive: jest.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            content: '## first',
            historyRowKey: 'rowkey-at-start',
            updatedAt: '2026-05-17T14:00:00Z',
          };
        }
        // If anything tried to read again, it would see a different value.
        return {
          content: '## second',
          historyRowKey: 'rowkey-after-save',
          updatedAt: '2026-05-17T15:00:00Z',
        };
      }),
    };

    const useCase = new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: mockLlmClient(),
      riesgoPaisProvider: mockRiesgoPais(),
      getPortfolioSummary: mockGetPortfolioSummary(),
      settingsRepository: mockSettingsRepo(),
      frameworkRepository,
      loadPrompt: mockLoadPrompt(),
      clock: () => new Date('2026-05-15T21:00:00Z'),
    });

    const analysis = await useCase.execute({ targetDate: '2026-05-15' });

    // Only one read; snapshot-at-start. The persisted rowKey is the one we
    // saw at the top of the run.
    expect(frameworkRepository.getActive).toHaveBeenCalledTimes(1);
    expect(analysis.frameworkHistoryRowKey).toBe('rowkey-at-start');
  });

  it('falls back to settingsRepository when frameworkRepository is not wired (legacy path)', async () => {
    const repository = mockRepository();
    const settingsRepository = mockSettingsRepo({
      'analysis.strategicFrameworkV1': '## Legacy framework via settings',
    });

    const useCase = new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: mockLlmClient(),
      riesgoPaisProvider: mockRiesgoPais(),
      getPortfolioSummary: mockGetPortfolioSummary(),
      settingsRepository,
      // No frameworkRepository.
      loadPrompt: mockLoadPrompt(),
      clock: () => new Date('2026-05-15T21:00:00Z'),
    });

    const analysis = await useCase.execute({ targetDate: '2026-05-15' });

    expect(analysis.frameworkHistoryRowKey).toBeNull();
    expect(settingsRepository.get).toHaveBeenCalledWith('analysis.strategicFrameworkV1');
  });

  it('persists frameworkHistoryRowKey on failure rows too (e.g. missing framework)', async () => {
    const repository = mockRepository();
    const frameworkRepository = {
      // Active row exists but with empty content → triggers "framework not configured"
      // failure path; we still know the rowKey of whatever was there.
      getActive: jest.fn().mockResolvedValue({
        content: '   ',
        historyRowKey: 'rk-fail',
        updatedAt: '2026-05-17T14:00:00Z',
      }),
    };
    const useCase = new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: mockLlmClient(),
      riesgoPaisProvider: mockRiesgoPais(),
      getPortfolioSummary: mockGetPortfolioSummary(),
      settingsRepository: mockSettingsRepo(),
      frameworkRepository,
      loadPrompt: mockLoadPrompt(),
      clock: () => new Date('2026-05-15T21:00:00Z'),
    });

    const failed = await useCase.execute({ targetDate: '2026-05-15' });

    expect(failed.status).toBe('failed');
    expect(failed.frameworkHistoryRowKey).toBe('rk-fail');
    const persistedFail = repository.upsert.mock.calls[0][0];
    expect(persistedFail.frameworkHistoryRowKey).toBe('rk-fail');
  });
});
