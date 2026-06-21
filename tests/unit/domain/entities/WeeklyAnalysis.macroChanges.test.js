/**
 * WeeklyAnalysis — feature 012 `macroChanges` field. Optionality, []/null,
 * malformed rejection, toJSON round-trip.
 */

const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const base = (over = {}) => ({
  date: '2026-06-13',
  status: 'completed',
  generatedAt: '2026-06-13T21:00:00Z',
  modelUsed: 'claude-opus-4-8',
  promptVersion: 'editable-instructions-v1+guardrail-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250),
  ...over,
});

const ROW = {
  key: 'bcraReserves', label: 'BCRA reserves', unit: 'USD M',
  priorValue: 28000, priorAsOf: '2026-06-06',
  currentValue: 29050, currentAsOf: '2026-06-13',
  deltaAbs: 1050, deltaPct: 3.75,
};

describe('WeeklyAnalysis feature-012 macroChanges', () => {
  it('defaults to null when absent (first run / pre-feature)', () => {
    expect(new WeeklyAnalysis(base()).macroChanges).toBeNull();
  });

  it('accepts [] (prior panel existed, nothing qualified) and a populated array', () => {
    expect(new WeeklyAnalysis(base({ macroChanges: [] })).macroChanges).toEqual([]);
    const wa = new WeeklyAnalysis(base({ macroChanges: [ROW] }));
    expect(wa.macroChanges).toHaveLength(1);
    expect(wa.macroChanges[0].deltaAbs).toBe(1050);
  });

  it('ignores a non-array value (treated as absent → null)', () => {
    expect(new WeeklyAnalysis(base({ macroChanges: 'nope' })).macroChanges).toBeNull();
  });

  it('rejects a present-but-malformed value (non-object entries)', () => {
    expect(() => new WeeklyAnalysis(base({ macroChanges: ['x'] }))).toThrow(/each macroChanges entry must be an object/);
  });

  it('freezes a populated value', () => {
    expect(Object.isFrozen(new WeeklyAnalysis(base({ macroChanges: [ROW] })).macroChanges)).toBe(true);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const wa = new WeeklyAnalysis(base({ macroChanges: [ROW] }));
    expect(WeeklyAnalysis.fromJSON(wa.toJSON()).macroChanges).toEqual([ROW]);
  });
});
