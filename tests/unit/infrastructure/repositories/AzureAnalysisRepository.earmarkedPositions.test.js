/**
 * AzureAnalysisRepository — feature 019 `earmarkedPositionsJson` round-trip.
 * Pure mappers: write-when-non-empty, re-run/replace drop, pre-feature absence,
 * malformed tolerance, and the failed-run persistence path (FR-007).
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const makeRepo = () => new AzureAnalysisRepository({});

const base = (over = {}) => new WeeklyAnalysis({
  date: '2026-06-20', status: 'completed', generatedAt: '2026-06-20T21:00:00Z',
  modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v2',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  ...over,
});

const RESERVE = [{
  broker: 'BROKER', assetType: 'cash', symbol: 'RESERVE',
  quantity: 10000, averageCost: 1, currentPrice: null, currency: 'USD', valueUsd: 10000,
}];

describe('AzureAnalysisRepository feature-019 earmarkedPositions mapping', () => {
  const repo = makeRepo();

  it('round-trips a populated earmarkedPositions array', () => {
    const back = repo._analysisFromEntity(repo._analysisToEntity(base({ earmarkedPositions: RESERVE })));
    expect(back.earmarkedPositions).toEqual(RESERVE);
  });

  it('omits the column when empty (clean row) and reads back as []', () => {
    const entity = repo._analysisToEntity(base({ earmarkedPositions: [] }));
    expect(entity.earmarkedPositionsJson).toBeUndefined();
    expect(repo._analysisFromEntity(entity).earmarkedPositions).toEqual([]);
  });

  it('reads a pre-feature row (column absent) back as []', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'Old analysis summary that predates feature 019 entirely here ok.',
      markdownBody: 'y'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    });
    expect(back.earmarkedPositions).toEqual([]);
  });

  it('re-run replace: present last week, empty this week → column dropped', () => {
    expect(repo._analysisToEntity(base({ earmarkedPositions: RESERVE })).earmarkedPositionsJson).toBeDefined();
    const second = repo._analysisToEntity(base({ earmarkedPositions: [] }));
    expect(second.earmarkedPositionsJson).toBeUndefined();
    expect(repo._analysisFromEntity(second).earmarkedPositions).toEqual([]);
  });

  it('tolerates malformed JSON in the column (→ [], no throw)', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-06-05', status: 'completed',
      generatedAt: '2026-06-05T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'A sufficiently long executive summary for validation purposes here.',
      markdownBody: 'z'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
      earmarkedPositionsJson: '{not valid',
    });
    expect(back.earmarkedPositions).toEqual([]);
  });

  it('round-trips earmarkedPositions on a FAILED-status row (FR-007)', () => {
    const failed = new WeeklyAnalysis({
      date: '2026-06-20', status: 'failed', generatedAt: '2026-06-20T21:00:00Z',
      modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v2',
      errorMessage: 'LLM request failed: simulated for test',
      tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 1,
      earmarkedPositions: RESERVE,
    });
    const back = repo._analysisFromEntity(repo._analysisToEntity(failed));
    expect(back.status).toBe('failed');
    expect(back.earmarkedPositions).toEqual(RESERVE);
  });
});
