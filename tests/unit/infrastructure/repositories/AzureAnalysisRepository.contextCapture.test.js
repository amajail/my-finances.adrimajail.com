/**
 * AzureAnalysisRepository — feature 006 serialization round-trip.
 *
 * Exercises the entity↔entity-row mappers directly (no Azurite needed) to prove
 * macroContext / portfolioTotals / positionChanges survive a serialize→
 * deserialize cycle, including the null-vs-[] distinction and pre-feature rows.
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

function makeRepo() {
  // database is unused by the pure mapper methods.
  return new AzureAnalysisRepository({});
}

const base = (over = {}) => new WeeklyAnalysis({
  date: '2026-05-15', status: 'completed', generatedAt: '2026-05-15T21:00:00Z',
  modelUsed: 'claude-opus-4-7', promptVersion: 'editable-instructions-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  ...over,
});

describe('AzureAnalysisRepository feature-006 mapping', () => {
  const repo = makeRepo();

  it('round-trips macroContext, portfolioTotals, and a populated positionChanges', () => {
    const wa = base({
      macroContext: { riesgoPais: { value: 524, asOf: '2026-05-15', available: true } },
      portfolioTotals: { totalUsd: 90000, totalArs: 1450, grandTotalUsd: 91000, unrealizedPnlUsd: 1, unrealizedPnlArs: 2, mepRate: 1450, mepRateAsOf: '2026-05-15' },
      positionChanges: [{ broker: 'ibkr', assetType: 'stock', symbol: 'MU', change: 'reduced', quantityBefore: 50, quantityAfter: 25, deltaQuantity: -25 }],
    });
    const entity = repo._analysisToEntity(wa);
    const back = repo._analysisFromEntity(entity);

    expect(back.macroContext.riesgoPais.value).toBe(524);
    expect(back.portfolioTotals.totalUsd).toBe(90000);
    expect(back.positionChanges).toHaveLength(1);
    expect(back.positionChanges[0].change).toBe('reduced');
  });

  it('preserves the positionChanges null (unknown) vs [] (no change) distinction', () => {
    const unknownEntity = repo._analysisToEntity(base({ positionChanges: null }));
    expect(repo._analysisFromEntity(unknownEntity).positionChanges).toBeNull();

    const emptyEntity = repo._analysisToEntity(base({ positionChanges: [] }));
    // [] must be serialized (column present, value "[]") and read back as [].
    expect(emptyEntity.positionChangesJson).toBe('[]');
    expect(repo._analysisFromEntity(emptyEntity).positionChanges).toEqual([]);
  });

  it('reads a pre-feature row (columns absent) back as null', () => {
    const preFeature = {
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'claude-opus-4-7',
      promptVersion: 'editable-instructions-v1',
      summary: 'Old analysis summary that predates feature 006 entirely here ok.',
      markdownBody: 'y'.repeat(250), riesgoPaisBp: 600, riesgoPaisAsOf: '2026-01-01',
      tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
      // no macroContextJson / portfolioTotalsJson / positionChangesJson
    };
    const back = repo._analysisFromEntity(preFeature);
    expect(back.macroContext).toBeNull();
    expect(back.portfolioTotals).toBeNull();
    expect(back.positionChanges).toBeNull();
  });
});
