/**
 * AzureAnalysisRepository — feature 010 serialization round-trip for the six
 * structured sections. Exercises the pure mappers (no Azurite needed),
 * including the re-run/replace case (FR-013) and malformed-column tolerance
 * (FR-008).
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const makeRepo = () => new AzureAnalysisRepository({});

const base = (over = {}) => new WeeklyAnalysis({
  date: '2026-06-12', status: 'completed', generatedAt: '2026-06-12T21:00:00Z',
  modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  ...over,
});

const SECTIONS = {
  driftByBucket: [{ key: 'us', label: 'US', targetPct: 45, currentPct: 50, driftPct: 5, currentUsd: 1000 }],
  driftByAssetClass: [{ key: 'us-etf', label: 'US — ETFs', targetPct: 25, currentPct: 22, driftPct: -3, currentUsd: 500 }],
  concentrationCaps: [{ label: 'SYM_A', scope: 'bucket', bucketKey: 'us', softPct: 40, hardPct: 50, currentPct: 47, breach: 'soft' }],
  watchlist: [{ item: 'ILLIQUID_A', trigger: 'thinly traded' }],
  weekOverWeek: [{ metric: 'ARG weight', prior: '28%', current: '31%', direction: 'up' }],
  frameworkAmendments: [{ proposal: 'Raise US-ETF target', rationale: 'persistent underweight' }],
};

describe('AzureAnalysisRepository feature-010 mapping', () => {
  const repo = makeRepo();

  it('round-trips all six structured sections', () => {
    const wa = base(SECTIONS);
    const back = repo._analysisFromEntity(repo._analysisToEntity(wa));
    for (const [name, value] of Object.entries(SECTIONS)) {
      expect(back[name]).toEqual(value);
    }
  });

  it('reads a pre-feature row (columns absent) back as null for all six', () => {
    const preFeature = {
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'claude-opus-4-7',
      promptVersion: 'editable-instructions-v1',
      summary: 'Old analysis summary that predates feature 010 entirely here ok.',
      markdownBody: 'y'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    };
    const back = repo._analysisFromEntity(preFeature);
    for (const name of Object.keys(SECTIONS)) expect(back[name]).toBeNull();
  });

  it('re-run replace: a section present last week is dropped when null this week (FR-013)', () => {
    // First upsert: drift present → column written.
    const first = repo._analysisToEntity(base({ driftByBucket: SECTIONS.driftByBucket }));
    expect(first.driftByBucketJson).toBeDefined();

    // Re-run for the same date with no drift (targets removed) → column absent.
    // 'Replace' upsert writes this entity wholesale, so the prior column is gone.
    const second = repo._analysisToEntity(base({ driftByBucket: null }));
    expect(second.driftByBucketJson).toBeUndefined();
    expect(repo._analysisFromEntity(second).driftByBucket).toBeNull();
  });

  it('tolerates malformed JSON in a column (→ null, no throw)', () => {
    const back = repo._analysisFromEntity({
      partitionKey: 'weekly', rowKey: '2026-06-05', status: 'completed',
      generatedAt: '2026-06-05T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'A sufficiently long executive summary for validation purposes here.',
      markdownBody: 'z'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
      concentrationCapsJson: '{not valid json',
    });
    expect(back.concentrationCaps).toBeNull();
  });
});
