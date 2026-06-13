/**
 * WeeklyAnalysis — feature 010 structured sections (driftByBucket,
 * driftByAssetClass, concentrationCaps, watchlist, weekOverWeek,
 * frameworkAmendments). Validates optionality, [] handling, malformed
 * rejection, and toJSON round-trip.
 */

const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const base = (over = {}) => ({
  date: '2026-06-12',
  status: 'completed',
  generatedAt: '2026-06-12T21:00:00Z',
  modelUsed: 'claude-opus-4-8',
  promptVersion: 'editable-instructions-v1',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250),
  ...over,
});

const FIELDS = [
  'driftByBucket', 'driftByAssetClass', 'concentrationCaps',
  'watchlist', 'weekOverWeek', 'frameworkAmendments',
];

describe('WeeklyAnalysis feature-010 structured sections', () => {
  it('defaults all six sections to null when absent (pre-feature compatibility)', () => {
    const wa = new WeeklyAnalysis(base());
    for (const f of FIELDS) expect(wa[f]).toBeNull();
  });

  it('accepts [] (checked, nothing to report) and a populated array', () => {
    const wa = new WeeklyAnalysis(base({
      concentrationCaps: [],
      driftByBucket: [{ key: 'us', label: 'US', targetPct: 45, currentPct: 50, driftPct: 5, currentUsd: 1000 }],
    }));
    expect(wa.concentrationCaps).toEqual([]);
    expect(wa.driftByBucket).toHaveLength(1);
    expect(wa.driftByBucket[0].driftPct).toBe(5);
  });

  it('rejects a present-but-malformed section (non-object entries)', () => {
    expect(() => new WeeklyAnalysis(base({ watchlist: ['not-an-object'] }))).toThrow(/watchlist entry must be an object/);
    expect(() => new WeeklyAnalysis(base({ driftByBucket: [[1, 2]] }))).toThrow(/driftByBucket entry must be an object/);
  });

  it('ignores a non-array value (treated as absent → null)', () => {
    const wa = new WeeklyAnalysis(base({ weekOverWeek: 'nope' }));
    expect(wa.weekOverWeek).toBeNull();
  });

  it('freezes populated sections (immutability)', () => {
    const wa = new WeeklyAnalysis(base({ watchlist: [{ item: 'X', trigger: 'rule' }] }));
    expect(Object.isFrozen(wa.watchlist)).toBe(true);
  });

  it('round-trips all six through toJSON / fromJSON', () => {
    const wa = new WeeklyAnalysis(base({
      driftByBucket: [{ key: 'us', label: 'US', targetPct: 45, currentPct: 50, driftPct: 5, currentUsd: 1000 }],
      driftByAssetClass: [{ key: 'us-etf', label: 'US — ETFs', targetPct: 25, currentPct: 22, driftPct: -3, currentUsd: 500 }],
      concentrationCaps: [{ label: 'SYM_A', scope: 'bucket', bucketKey: 'us', softPct: 40, hardPct: 50, currentPct: 47, breach: 'soft' }],
      watchlist: [{ item: 'ILLIQUID_A', trigger: 'thinly traded' }],
      weekOverWeek: [{ metric: 'ARG weight', prior: '28%', current: '31%', direction: 'up' }],
      frameworkAmendments: [{ proposal: 'Raise US-ETF target', rationale: 'persistent underweight' }],
    }));
    const back = WeeklyAnalysis.fromJSON(wa.toJSON());
    for (const f of FIELDS) expect(back[f]).toEqual(wa[f]);
  });
});
