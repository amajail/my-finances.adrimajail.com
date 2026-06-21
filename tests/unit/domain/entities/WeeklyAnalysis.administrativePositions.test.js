/**
 * WeeklyAnalysis — feature 013 `administrativePositions` field. Optionality,
 * [] default, malformed rejection, freeze, toJSON round-trip.
 */

const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const base = (over = {}) => ({
  date: '2026-06-20',
  status: 'completed',
  generatedAt: '2026-06-20T21:00:00Z',
  modelUsed: 'claude-opus-4-8',
  promptVersion: 'editable-instructions-v1+guardrail-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250),
  ...over,
});

const STUB = {
  broker: 'BROKER', assetType: 'stock', symbol: 'STUB',
  quantity: 10, averageCost: 0, currentPrice: null, currency: 'USD', valueUsd: 0,
};

describe('WeeklyAnalysis feature-013 administrativePositions', () => {
  it('defaults to [] when absent (pre-feature / no stubs)', () => {
    expect(new WeeklyAnalysis(base()).administrativePositions).toEqual([]);
  });

  it('accepts a populated array', () => {
    const wa = new WeeklyAnalysis(base({ administrativePositions: [STUB] }));
    expect(wa.administrativePositions).toHaveLength(1);
    expect(wa.administrativePositions[0].symbol).toBe('STUB');
    expect(wa.administrativePositions[0].valueUsd).toBe(0);
  });

  it('ignores a non-array value (treated as absent → [])', () => {
    expect(new WeeklyAnalysis(base({ administrativePositions: 'nope' })).administrativePositions).toEqual([]);
  });

  it('rejects a present-but-malformed value (non-object entries)', () => {
    expect(() => new WeeklyAnalysis(base({ administrativePositions: ['x'] })))
      .toThrow(/each administrativePositions entry must be an object/);
  });

  it('freezes the array', () => {
    expect(Object.isFrozen(new WeeklyAnalysis(base({ administrativePositions: [STUB] })).administrativePositions)).toBe(true);
    // also frozen when empty (default)
    expect(Object.isFrozen(new WeeklyAnalysis(base()).administrativePositions)).toBe(true);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const wa = new WeeklyAnalysis(base({ administrativePositions: [STUB] }));
    expect(WeeklyAnalysis.fromJSON(wa.toJSON()).administrativePositions).toEqual([STUB]);
  });
});
