/**
 * BenchmarkAligner tests (feature 009, FR-007/FR-008).
 */
const BenchmarkAligner = require('../../../../src/domain/services/BenchmarkAligner');

const obs = [
  { date: '2026-05-01', value: 10 },
  { date: '2026-05-10', value: 12 },
];

describe('BenchmarkAligner.alignOnOrBefore', () => {
  it('uses the latest observation on or before each date (carrying its as-of)', () => {
    const r = BenchmarkAligner.alignOnOrBefore(obs, ['2026-05-05', '2026-05-10', '2026-05-20']);
    expect(r[0]).toEqual({ date: '2026-05-05', value: 10, asOf: '2026-05-01', available: true });
    expect(r[1]).toEqual({ date: '2026-05-10', value: 12, asOf: '2026-05-10', available: true }); // exact
    expect(r[2]).toEqual({ date: '2026-05-20', value: 12, asOf: '2026-05-10', available: true }); // carry last
  });

  it('returns a gap for a date preceding the entire series (never a future reading)', () => {
    const r = BenchmarkAligner.alignOnOrBefore(obs, ['2026-04-30']);
    expect(r[0]).toEqual({ date: '2026-04-30', value: null, asOf: null, available: false });
  });

  it('returns all gaps when there are no observations', () => {
    const r = BenchmarkAligner.alignOnOrBefore([], ['2026-05-05']);
    expect(r[0].available).toBe(false);
  });

  it('preserves input date order and sorts unsorted observations', () => {
    const r = BenchmarkAligner.alignOnOrBefore([obs[1], obs[0]], ['2026-05-05']);
    expect(r[0].value).toBe(10);
  });
});
