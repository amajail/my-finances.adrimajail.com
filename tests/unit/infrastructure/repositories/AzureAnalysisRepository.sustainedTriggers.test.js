/**
 * AzureAnalysisRepository — feature 021 `sustainedTriggersJson` (analysis row)
 * mapping. Pure mappers.
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const repo = new AzureAnalysisRepository({});

const base = (over = {}) => new WeeklyAnalysis({
  date: '2026-06-20', status: 'completed', generatedAt: '2026-06-20T21:00:00Z',
  modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v2',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  ...over,
});

const ROW = {
  key: 'riesgoPais', label: 'Riesgo país', unit: 'bp', comparator: '>', threshold: 800, requiredDays: 30,
  currentValue: 850, currentAsOf: '2026-06-19', status: 'met', heldDays: 35, durationMet: true,
  daysRemaining: null, streakStart: '2026-05-15', includesUnknown: false, historyLimited: false,
  observations: 5, note: null,
};

describe('AzureAnalysisRepository feature-021 sustainedTriggers mapping', () => {
  it('round-trips a populated sustainedTriggers array', () => {
    const back = repo._analysisFromEntity(repo._analysisToEntity(base({ sustainedTriggers: [ROW] })));
    expect(back.sustainedTriggers).toEqual([ROW]);
  });

  it('omits the column when null and reads back as null', () => {
    const entity = repo._analysisToEntity(base());
    expect(entity.sustainedTriggersJson).toBeUndefined();
    expect(repo._analysisFromEntity(entity).sustainedTriggers).toBeNull();
  });

  it('writes an empty array so "computed, nothing defined" stays distinguishable', () => {
    const entity = repo._analysisToEntity(base({ sustainedTriggers: [] }));
    expect(entity.sustainedTriggersJson).toBe('[]');
    expect(repo._analysisFromEntity(entity).sustainedTriggers).toEqual([]);
  });

  it('reads a pre-feature row back as null and tolerates malformed JSON', () => {
    const row = {
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'Old analysis summary that predates feature 021 entirely here ok.',
      markdownBody: 'y'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    };
    expect(repo._analysisFromEntity(row).sustainedTriggers).toBeNull();
    expect(repo._analysisFromEntity({ ...row, sustainedTriggersJson: '{not valid' }).sustainedTriggers).toBeNull();
  });

  it('rejects a malformed row at the entity boundary', () => {
    expect(() => base({ sustainedTriggers: [{ ...ROW, status: 'bogus' }] })).toThrow(/sustainedTrigger/);
    expect(() => base({ sustainedTriggers: [{ ...ROW, heldDays: -1 }] })).toThrow(/sustainedTrigger/);
    expect(() => base({ sustainedTriggers: [{ ...ROW, heldDays: 1.5 }] })).toThrow(/sustainedTrigger/);
    expect(() => base({ sustainedTriggers: [{ ...ROW, durationMet: 'yes' }] })).toThrow(/sustainedTrigger/);
  });
});
