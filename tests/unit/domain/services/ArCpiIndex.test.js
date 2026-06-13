/**
 * ArCpiIndex tests (feature 009).
 */
const ArCpiIndex = require('../../../../src/domain/services/ArCpiIndex');

describe('ArCpiIndex.build', () => {
  it('returns [] for empty input', () => {
    expect(ArCpiIndex.build([])).toEqual([]);
    expect(ArCpiIndex.build(null)).toEqual([]);
  });

  it('anchors the first month at 100 and compounds forward', () => {
    const out = ArCpiIndex.build([
      { date: '2026-01-31', percent: 2 },
      { date: '2026-02-28', percent: 3 },
      { date: '2026-03-31', percent: 1 },
    ]);
    expect(out[0]).toEqual({ date: '2026-01-31', value: 100 });
    expect(out[1].value).toBeCloseTo(103, 6);          // 100 × 1.03
    expect(out[2].value).toBeCloseTo(104.03, 4);       // 103 × 1.01
  });

  it('sorts ascending and ignores non-numeric entries', () => {
    const out = ArCpiIndex.build([
      { date: '2026-02-28', percent: 3 },
      { date: '2026-01-31', percent: 2 },
      { date: '2026-03-31', percent: 'x' },
    ]);
    expect(out.map((o) => o.date)).toEqual(['2026-01-31', '2026-02-28']);
  });
});
