/**
 * WeeklyAnalysis — feature 014 `duplications` field. Optionality, []/null,
 * malformed rejection, freeze, toJSON round-trip.
 */

const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const base = (over = {}) => ({
  date: '2026-06-20', status: 'completed', generatedAt: '2026-06-20T21:00:00Z',
  modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), ...over,
});

const GROUP = {
  symbol: 'DUP', label: 'DUP', placementCount: 2, totalValueUsd: 1250,
  placements: [
    { broker: 'ibkr', assetType: 'stock', quantity: 10, valueUsd: 1000 },
    { broker: 'bullmarket', assetType: 'cedear', quantity: 5, valueUsd: 250 },
  ],
};

describe('WeeklyAnalysis feature-014 duplications', () => {
  it('defaults to null when absent (pre-feature)', () => {
    expect(new WeeklyAnalysis(base()).duplications).toBeNull();
  });

  it('accepts [] and a populated array', () => {
    expect(new WeeklyAnalysis(base({ duplications: [] })).duplications).toEqual([]);
    const wa = new WeeklyAnalysis(base({ duplications: [GROUP] }));
    expect(wa.duplications).toHaveLength(1);
    expect(wa.duplications[0].symbol).toBe('DUP');
  });

  it('ignores a non-array value (treated as absent → null)', () => {
    expect(new WeeklyAnalysis(base({ duplications: 'nope' })).duplications).toBeNull();
  });

  it('rejects a present-but-malformed value (non-object entries)', () => {
    expect(() => new WeeklyAnalysis(base({ duplications: ['x'] })))
      .toThrow(/each duplications entry must be an object/);
  });

  it('freezes a populated value', () => {
    expect(Object.isFrozen(new WeeklyAnalysis(base({ duplications: [GROUP] })).duplications)).toBe(true);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const wa = new WeeklyAnalysis(base({ duplications: [GROUP] }));
    expect(WeeklyAnalysis.fromJSON(wa.toJSON()).duplications).toEqual([GROUP]);
  });
});
