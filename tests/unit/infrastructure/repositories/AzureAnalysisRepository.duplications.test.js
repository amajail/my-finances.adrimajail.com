/**
 * AzureAnalysisRepository — feature 014 `duplicationsJson` round-trip.
 * Pure mappers: write-when-non-empty, re-run/replace drop, pre-feature absence,
 * malformed tolerance.
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const makeRepo = () => new AzureAnalysisRepository({});

const base = (over = {}) => new WeeklyAnalysis({
  date: '2026-06-20', status: 'completed', generatedAt: '2026-06-20T21:00:00Z',
  modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  ...over,
});

const GROUPS = [{
  symbol: 'DUP', label: 'DUP', placementCount: 2, totalValueUsd: 1250,
  placements: [
    { broker: 'ibkr', assetType: 'stock', quantity: 10, valueUsd: 1000 },
    { broker: 'bullmarket', assetType: 'cedear', quantity: 5, valueUsd: 250 },
  ],
}];

describe('AzureAnalysisRepository feature-014 duplications mapping', () => {
  const repo = makeRepo();

  it('round-trips a populated duplications array', () => {
    const back = repo._analysisFromEntity(repo._analysisToEntity(base({ duplications: GROUPS })));
    expect(back.duplications).toEqual(GROUPS);
  });

  it('omits the column when empty and reads back as null', () => {
    const entity = repo._analysisToEntity(base({ duplications: [] }));
    expect(entity.duplicationsJson).toBeUndefined();
    expect(repo._analysisFromEntity(entity).duplications).toBeNull();
  });

  it('reads a pre-feature row (column absent) back as null', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'Old analysis summary that predates feature 014 entirely here ok.',
      markdownBody: 'y'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    expect(back.duplications).toBeNull();
  });

  it('re-run replace: present last week, empty this week → column dropped', () => {
    expect(repo._analysisToEntity(base({ duplications: GROUPS })).duplicationsJson).toBeDefined();
    const second = repo._analysisToEntity(base({ duplications: [] }));
    expect(second.duplicationsJson).toBeUndefined();
    expect(repo._analysisFromEntity(second).duplications).toBeNull();
  });

  it('tolerates malformed JSON in the column (→ null, no throw)', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-06-05', status: 'completed',
      generatedAt: '2026-06-05T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'A sufficiently long executive summary for validation purposes here.',
      markdownBody: 'z'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
      duplicationsJson: '{not valid',
    });
    expect(back.duplications).toBeNull();
  });
});
