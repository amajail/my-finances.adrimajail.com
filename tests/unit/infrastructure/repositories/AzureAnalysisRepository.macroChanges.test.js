/**
 * AzureAnalysisRepository — feature 012 `macroChangesJson` round-trip. Exercises
 * the pure mappers, including re-run/replace (FR-012) and malformed tolerance.
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const makeRepo = () => new AzureAnalysisRepository({});

const base = (over = {}) => new WeeklyAnalysis({
  date: '2026-06-13', status: 'completed', generatedAt: '2026-06-13T21:00:00Z',
  modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  ...over,
});

const ROWS = [{
  key: 'bcraReserves', label: 'BCRA reserves', unit: 'USD M',
  priorValue: 28000, priorAsOf: '2026-06-06',
  currentValue: 29050, currentAsOf: '2026-06-13',
  deltaAbs: 1050, deltaPct: 3.75,
}];

describe('AzureAnalysisRepository feature-012 macroChanges mapping', () => {
  const repo = makeRepo();

  it('round-trips macroChanges', () => {
    const back = repo._analysisFromEntity(repo._analysisToEntity(base({ macroChanges: ROWS })));
    expect(back.macroChanges).toEqual(ROWS);
  });

  it('reads a pre-feature row (column absent) back as null', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'Old analysis summary that predates feature 012 entirely here ok.',
      markdownBody: 'y'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    expect(back.macroChanges).toBeNull();
  });

  it('re-run replace: present last week, null this week → column dropped (FR-012)', () => {
    expect(repo._analysisToEntity(base({ macroChanges: ROWS })).macroChangesJson).toBeDefined();
    const second = repo._analysisToEntity(base({ macroChanges: null }));
    expect(second.macroChangesJson).toBeUndefined();
    expect(repo._analysisFromEntity(second).macroChanges).toBeNull();
  });

  it('tolerates malformed JSON in the column (→ null, no throw)', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-06-05', status: 'completed',
      generatedAt: '2026-06-05T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'A sufficiently long executive summary for validation purposes here.',
      markdownBody: 'z'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
      macroChangesJson: '{not valid',
    });
    expect(back.macroChanges).toBeNull();
  });
});
