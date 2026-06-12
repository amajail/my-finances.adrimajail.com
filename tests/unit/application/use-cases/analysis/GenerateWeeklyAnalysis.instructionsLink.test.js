/**
 * GenerateWeeklyAnalysis — instructions version link (feature 005, FR-012, FR-013).
 *
 * Verifies that the use-case:
 *   - reads the active instructions content + historyRowKey in a single call
 *     (snapshot-at-start)
 *   - uses the instructions content VERBATIM as the system prompt (no token
 *     substitution, no template file)
 *   - persists instructionsHistoryRowKey on the produced WeeklyAnalysis
 *   - leaves instructionsHistoryRowKey: null when getActive() returns content
 *     seeded without a history entry (historyRowKey: null)
 *   - fails clearly ("instructions not configured") when no active document
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
  };
  const final = { ...defaults, ...map };
  return { get: jest.fn(async (key) => (key in final ? final[key] : null)) };
}

function mockMacroProvider() {
  return {
    getLatest: jest.fn().mockResolvedValue({
      readings: {
        riesgoPais: { value: 500, asOf: '2026-05-15', available: true },
        fxGap: { value: 0.3, asOf: '2026-05-15', available: true },
        bcraReserves: { value: 47834, asOf: '2026-05-13', available: true, basis: 'gross' },
        argInflation: { value: 2.1, asOf: '2026-04-30', available: true },
        argInterestRate: { value: 29, asOf: '2026-05-15', available: true },
        usaInflation: { value: 3.1, asOf: '2026-04-01', available: true },
        usaInterestRate: { value: 4.5, asOf: '2026-05-15', available: true },
        sp500Drawdown: { value: -2.4, asOf: '2026-05-15', available: true },
        imfReviewStatus: { value: 'approved', asOf: '2026-05-10', available: true },
      },
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    }),
  };
}

function build({
  instructionsActive = {
    content: '# Full instructions document\n\nRole, guardrails, framework — all inline.',
    historyRowKey: '8284000000000-aaaa',
    updatedAt: '2026-06-11T14:00:00Z',
  },
} = {}) {
  const repository = mockRepository();
  const llmClient = mockLlmClient();
  const instructionsRepository = {
    getActive: jest.fn().mockResolvedValue(instructionsActive),
  };
  const useCase = new GenerateWeeklyAnalysis({
    analysisRepository: repository,
    llmClient,
    macroContextProvider: mockMacroProvider(),
    getPortfolioSummary: mockGetPortfolioSummary(),
    settingsRepository: mockSettingsRepo(),
    instructionsRepository,
    clock: () => new Date('2026-06-12T21:00:00Z'),
  });
  return { useCase, repository, instructionsRepository, llmClient };
}

describe('GenerateWeeklyAnalysis — instructions version link (FR-012, FR-013)', () => {
  it('captures historyRowKey from getActive() and persists it on the analysis row', async () => {
    const { useCase, repository, instructionsRepository } = build();

    const analysis = await useCase.execute({ targetDate: '2026-06-12' });

    expect(instructionsRepository.getActive).toHaveBeenCalledTimes(1);
    expect(analysis.instructionsHistoryRowKey).toBe('8284000000000-aaaa');
    expect(repository.upsert).toHaveBeenCalledTimes(1);
    const persistedAnalysis = repository.upsert.mock.calls[0][0];
    expect(persistedAnalysis.instructionsHistoryRowKey).toBe('8284000000000-aaaa');
  });

  it('uses the instructions content verbatim as the system prompt (FR-003/FR-004)', async () => {
    const content = '# Verbatim doc\n\nNo {{tokens}} are substituted here.';
    const { useCase, llmClient } = build({
      instructionsActive: { content, historyRowKey: 'r1', updatedAt: 't' },
    });

    await useCase.execute({ targetDate: '2026-06-12' });

    expect(llmClient.submitAnalysis).toHaveBeenCalledTimes(1);
    expect(llmClient.submitAnalysis.mock.calls[0][0].systemPrompt).toBe(content);
  });

  it('persists instructionsHistoryRowKey: null for content seeded without history', async () => {
    const { useCase, repository } = build({
      instructionsActive: {
        content: 'seeded content with no history entry',
        historyRowKey: null,
        updatedAt: null,
      },
    });

    const analysis = await useCase.execute({ targetDate: '2026-06-12' });

    expect(analysis.instructionsHistoryRowKey).toBeNull();
    const persistedAnalysis = repository.upsert.mock.calls[0][0];
    expect(persistedAnalysis.instructionsHistoryRowKey).toBeNull();
  });

  it('snapshot-at-start: only one getActive() read; persisted rowKey is the start value', async () => {
    const repository = mockRepository();
    let callCount = 0;
    const instructionsRepository = {
      getActive: jest.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          return { content: '## first', historyRowKey: 'rowkey-at-start', updatedAt: '2026-06-11T14:00:00Z' };
        }
        return { content: '## second', historyRowKey: 'rowkey-after-save', updatedAt: '2026-06-11T15:00:00Z' };
      }),
    };

    const useCase = new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: mockLlmClient(),
      macroContextProvider: mockMacroProvider(),
      getPortfolioSummary: mockGetPortfolioSummary(),
      settingsRepository: mockSettingsRepo(),
      instructionsRepository,
      clock: () => new Date('2026-06-12T21:00:00Z'),
    });

    const analysis = await useCase.execute({ targetDate: '2026-06-12' });

    expect(instructionsRepository.getActive).toHaveBeenCalledTimes(1);
    expect(analysis.instructionsHistoryRowKey).toBe('rowkey-at-start');
  });

  it('fails clearly when no active document is configured (FR-014)', async () => {
    const repository = mockRepository();
    const instructionsRepository = {
      // Row exists but content is empty → "instructions not configured".
      getActive: jest.fn().mockResolvedValue({
        content: '   ',
        historyRowKey: 'rk-fail',
        updatedAt: '2026-06-11T14:00:00Z',
      }),
    };
    const useCase = new GenerateWeeklyAnalysis({
      analysisRepository: repository,
      llmClient: mockLlmClient(),
      macroContextProvider: mockMacroProvider(),
      getPortfolioSummary: mockGetPortfolioSummary(),
      settingsRepository: mockSettingsRepo(),
      instructionsRepository,
      clock: () => new Date('2026-06-12T21:00:00Z'),
    });

    const failed = await useCase.execute({ targetDate: '2026-06-12' });

    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toMatch(/instructions not configured/);
    // Even on the failure row we record the version rowKey we saw.
    expect(failed.instructionsHistoryRowKey).toBe('rk-fail');
    const persistedFail = repository.upsert.mock.calls[0][0];
    expect(persistedFail.instructionsHistoryRowKey).toBe('rk-fail');
  });
});
