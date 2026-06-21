/**
 * AzureAnalysisRepository — feature 013 `administrativePositionsJson` round-trip.
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

const STUBS = [{
  broker: 'BROKER', assetType: 'stock', symbol: 'STUB',
  quantity: 10, averageCost: 0, currentPrice: null, currency: 'USD', valueUsd: 0,
}];

describe('AzureAnalysisRepository feature-013 administrativePositions mapping', () => {
  const repo = makeRepo();

  it('round-trips a populated administrativePositions array', () => {
    const back = repo._analysisFromEntity(repo._analysisToEntity(base({ administrativePositions: STUBS })));
    expect(back.administrativePositions).toEqual(STUBS);
  });

  it('omits the column when empty (clean row) and reads back as []', () => {
    const entity = repo._analysisToEntity(base({ administrativePositions: [] }));
    expect(entity.administrativePositionsJson).toBeUndefined();
    expect(repo._analysisFromEntity(entity).administrativePositions).toEqual([]);
  });

  it('reads a pre-feature row (column absent) back as []', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'Old analysis summary that predates feature 013 entirely here ok.',
      markdownBody: 'y'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    expect(back.administrativePositions).toEqual([]);
  });

  it('re-run replace: present last week, empty this week → column dropped', () => {
    expect(repo._analysisToEntity(base({ administrativePositions: STUBS })).administrativePositionsJson).toBeDefined();
    const second = repo._analysisToEntity(base({ administrativePositions: [] }));
    expect(second.administrativePositionsJson).toBeUndefined();
    expect(repo._analysisFromEntity(second).administrativePositions).toEqual([]);
  });

  it('tolerates malformed JSON in the column (→ [], no throw)', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-06-05', status: 'completed',
      generatedAt: '2026-06-05T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'A sufficiently long executive summary for validation purposes here.',
      markdownBody: 'z'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
      administrativePositionsJson: '{not valid',
    });
    expect(back.administrativePositions).toEqual([]);
  });
});
