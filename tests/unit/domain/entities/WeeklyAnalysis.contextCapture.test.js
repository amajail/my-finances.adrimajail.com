/**
 * WeeklyAnalysis — feature 006 fields (macroContext, portfolioTotals,
 * positionChanges). Validates optionality, null-vs-[] for positionChanges, and
 * toJSON/fromJSON round-trip.
 */

const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const base = (over = {}) => ({
  date: '2026-05-15',
  status: 'completed',
  generatedAt: '2026-05-15T21:00:00Z',
  modelUsed: 'claude-opus-4-7',
  promptVersion: 'editable-instructions-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250),
  ...over,
});

describe('WeeklyAnalysis feature-006 fields', () => {
  it('accepts an analysis with none of the new fields (pre-feature compatibility)', () => {
    const wa = new WeeklyAnalysis(base());
    expect(wa.macroContext).toBeNull();
    expect(wa.portfolioTotals).toBeNull();
    expect(wa.positionChanges).toBeNull();
  });

  it('distinguishes positionChanges null (unknown) from [] (no change)', () => {
    expect(new WeeklyAnalysis(base({ positionChanges: null })).positionChanges).toBeNull();
    expect(new WeeklyAnalysis(base({ positionChanges: [] })).positionChanges).toEqual([]);
  });

  it('stores macroContext + portfolioTotals and survives toJSON/fromJSON', () => {
    const macroContext = {
      riesgoPais: { value: 524, asOf: '2026-05-15', available: true },
      bcraReserves: { value: 47834, asOf: '2026-05-13', available: true, basis: 'gross' },
      imfReviewStatus: { value: 'approved', asOf: '2026-05-10', available: true },
    };
    const portfolioTotals = {
      totalUsd: 90000, totalArs: 1450, grandTotalUsd: 91000,
      unrealizedPnlUsd: 1200, unrealizedPnlArs: -50, mepRate: 1450, mepRateAsOf: '2026-05-15',
    };
    const positionChanges = [
      { broker: 'ibkr', assetType: 'stock', symbol: 'MU', change: 'reduced', quantityBefore: 50, quantityAfter: 25, deltaQuantity: -25 },
    ];
    const wa = new WeeklyAnalysis(base({ macroContext, portfolioTotals, positionChanges }));
    const round = WeeklyAnalysis.fromJSON(wa.toJSON());

    expect(round.macroContext.bcraReserves.basis).toBe('gross');
    expect(round.portfolioTotals.totalUsd).toBe(90000);
    expect(round.positionChanges[0].change).toBe('reduced');
  });

  it('rejects a malformed positionChange', () => {
    expect(() => new WeeklyAnalysis(base({ positionChanges: [{ symbol: 'X', change: 'mutated' }] }))).toThrow();
  });

  it('rejects non-numeric portfolioTotals fields', () => {
    expect(() => new WeeklyAnalysis(base({ portfolioTotals: { totalUsd: 'lots' } }))).toThrow();
  });
});
