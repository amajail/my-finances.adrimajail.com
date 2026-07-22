/**
 * WeeklyAnalysis — feature 019 `earmarkedPositions` field. Optionality,
 * [] default, malformed rejection, freeze, toJSON round-trip.
 */

const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const base = (over = {}) => ({
  date: '2026-06-20',
  status: 'completed',
  generatedAt: '2026-06-20T21:00:00Z',
  modelUsed: 'claude-opus-4-8',
  promptVersion: 'editable-instructions-v1+guardrail-v2',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250),
  ...over,
});

const RESERVE = {
  broker: 'BROKER', assetType: 'cash', symbol: 'RESERVE',
  quantity: 10000, averageCost: 1, currentPrice: null, currency: 'USD', valueUsd: 10000,
};

describe('WeeklyAnalysis feature-019 earmarkedPositions', () => {
  it('defaults to [] when absent (pre-feature / none earmarked)', () => {
    expect(new WeeklyAnalysis(base()).earmarkedPositions).toEqual([]);
  });

  it('accepts a populated array', () => {
    const wa = new WeeklyAnalysis(base({ earmarkedPositions: [RESERVE] }));
    expect(wa.earmarkedPositions).toHaveLength(1);
    expect(wa.earmarkedPositions[0].symbol).toBe('RESERVE');
    expect(wa.earmarkedPositions[0].valueUsd).toBe(10000);
  });

  it('ignores a non-array value (treated as absent → [])', () => {
    expect(new WeeklyAnalysis(base({ earmarkedPositions: 'nope' })).earmarkedPositions).toEqual([]);
  });

  it('rejects a present-but-malformed value (non-object entries)', () => {
    expect(() => new WeeklyAnalysis(base({ earmarkedPositions: ['x'] })))
      .toThrow(/each earmarkedPositions entry must be an object/);
  });

  it('freezes the array', () => {
    expect(Object.isFrozen(new WeeklyAnalysis(base({ earmarkedPositions: [RESERVE] })).earmarkedPositions)).toBe(true);
    // also frozen when empty (default)
    expect(Object.isFrozen(new WeeklyAnalysis(base()).earmarkedPositions)).toBe(true);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const wa = new WeeklyAnalysis(base({ earmarkedPositions: [RESERVE] }));
    expect(WeeklyAnalysis.fromJSON(wa.toJSON()).earmarkedPositions).toEqual([RESERVE]);
  });
});
