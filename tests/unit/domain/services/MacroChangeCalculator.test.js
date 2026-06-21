/**
 * MacroChangeCalculator tests (feature 012, US1 / FR-002..FR-006, FR-010).
 */

const MacroChangeCalculator = require('../../../../src/domain/services/MacroChangeCalculator');

const reading = (value, asOf = '2026-06-13', available = true) => ({ value, asOf, available });

const panel = (over = {}) => ({
  riesgoPais: reading(600),
  fxGap: reading(30),
  bcraReserves: reading(28000),
  argInflation: reading(2.1),
  argInterestRate: reading(29),
  usaInflation: reading(3.1),
  usaInterestRate: reading(4.5),
  sp500Drawdown: reading(-2.4),
  imfReviewStatus: { value: 'approved', asOf: '2026-06-10', available: true }, // textual
  ...over,
});

describe('MacroChangeCalculator.diff', () => {
  it('returns null when there is no prior panel (first run, FR-006)', () => {
    expect(MacroChangeCalculator.diff(null, panel())).toBeNull();
    expect(MacroChangeCalculator.diff(undefined, panel())).toBeNull();
  });

  it('computes prior/current/abs/pct per numeric indicator, incl. reserves', () => {
    const prior = panel({ bcraReserves: reading(28000, '2026-06-06') });
    const current = panel({ bcraReserves: reading(29050, '2026-06-13') });
    const rows = MacroChangeCalculator.diff(prior, current);

    const res = rows.find((r) => r.key === 'bcraReserves');
    expect(res).toBeTruthy();
    expect(res.priorValue).toBe(28000);
    expect(res.currentValue).toBe(29050);
    expect(res.deltaAbs).toBe(1050);            // current - prior
    expect(res.deltaPct).toBe(3.75);            // 1050/28000*100
    expect(res.priorAsOf).toBe('2026-06-06');
    expect(res.currentAsOf).toBe('2026-06-13');
    expect(res.label).toBe('BCRA reserves');
    expect(res.unit).toBe('USD M');
  });

  it('handles negative deltas (signed change)', () => {
    const rows = MacroChangeCalculator.diff(panel({ riesgoPais: reading(640) }), panel({ riesgoPais: reading(595) }));
    const rp = rows.find((r) => r.key === 'riesgoPais');
    expect(rp.deltaAbs).toBe(-45);
    expect(rp.deltaPct).toBe(-7.03);            // -45/640*100 ≈ -7.03
  });

  it('excludes the textual imfReviewStatus (FR-005)', () => {
    const rows = MacroChangeCalculator.diff(panel(), panel());
    expect(rows.some((r) => r.key === 'imfReviewStatus')).toBe(false);
  });

  it('skips an indicator missing or unavailable on either side (FR-004)', () => {
    const prior = panel({ fxGap: { value: null, asOf: null, available: false } });
    const current = panel();
    const rows = MacroChangeCalculator.diff(prior, current);
    expect(rows.some((r) => r.key === 'fxGap')).toBe(false);
    // a still-present indicator remains
    expect(rows.some((r) => r.key === 'riesgoPais')).toBe(true);
  });

  it('omits percent change when prior value is zero (FR-010), keeping the absolute change', () => {
    const rows = MacroChangeCalculator.diff(panel({ sp500Drawdown: reading(0) }), panel({ sp500Drawdown: reading(-3) }));
    const dd = rows.find((r) => r.key === 'sp500Drawdown');
    expect(dd.deltaAbs).toBe(-3);
    expect(dd.deltaPct).toBeNull();
  });

  it('returns [] when a prior panel exists but no indicator qualifies', () => {
    const empty = { imfReviewStatus: { value: 'approved', asOf: 'x', available: true } };
    expect(MacroChangeCalculator.diff(empty, empty)).toEqual([]);
  });
});
