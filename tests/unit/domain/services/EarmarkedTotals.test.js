/**
 * EarmarkedTotals tests — investable (ex-earmarked) split of a persisted
 * analysis row's totals (feature 019 follow-up).
 */

const EarmarkedTotals = require('../../../../src/domain/services/EarmarkedTotals');

const totals = (over = {}) => ({ totalUsd: 300, totalArs: 200000, grandTotalUsd: 400, mepRate: 1000, ...over });

describe('EarmarkedTotals.split', () => {
  it('returns null for null totals', () => {
    expect(EarmarkedTotals.split(null, [])).toBeNull();
  });

  it('leaves a row with no earmarked positions continuous with its grand total', () => {
    // The pre-earmark case: those rows' grand totals were computed from market
    // values that already excluded the unpriced reserve, so nothing to net out.
    for (const earmarked of [undefined, null, []]) {
      expect(EarmarkedTotals.split(totals(), earmarked)).toMatchObject({
        earmarkedTotalUsd: 0, investableUsd: 300, investableArs: 200000, investableTotalUsd: 400,
      });
    }
  });

  it('preserves the raw persisted fields alongside the derived ones', () => {
    const r = EarmarkedTotals.split(totals({ unrealizedPnlUsd: 42, mepRateAsOf: '2026-07-22' }), []);
    expect(r).toMatchObject({ totalUsd: 300, totalArs: 200000, grandTotalUsd: 400, unrealizedPnlUsd: 42, mepRateAsOf: '2026-07-22' });
  });

  it('nets a USD reserve out of the USD sleeve and the grand total only', () => {
    const r = EarmarkedTotals.split(totals(), [{ currency: 'USD', quantity: 100, currentPrice: 1, valueUsd: 100 }]);
    expect(r).toMatchObject({ earmarkedTotalUsd: 100, investableUsd: 200, investableArs: 200000, investableTotalUsd: 300 });
  });

  it('nets an ARS reserve out of the ARS sleeve in native currency', () => {
    // 50,000 ARS at MEP 1000 = USD 50: ARS sleeve drops by the nominal amount,
    // the grand total by the USD equivalent, the USD sleeve not at all.
    const r = EarmarkedTotals.split(totals(), [{ currency: 'ARS', quantity: 50000, currentPrice: 1, valueUsd: 50 }]);
    expect(r).toMatchObject({ earmarkedTotalUsd: 50, investableUsd: 300, investableArs: 150000, investableTotalUsd: 350 });
  });

  it('falls back to valueUsd (MEP-converted for ARS) when a row has no usable price', () => {
    const r = EarmarkedTotals.split(totals(), [
      { currency: 'USD', quantity: 100, currentPrice: null, valueUsd: 100 },
      { currency: 'ARS', quantity: 50000, currentPrice: null, valueUsd: 50 },
    ]);
    expect(r).toMatchObject({ earmarkedTotalUsd: 150, investableUsd: 200, investableArs: 150000, investableTotalUsd: 250 });
  });

  it('sums multiple reserve rows and ignores non-value-bearing ones', () => {
    const r = EarmarkedTotals.split(totals(), [
      { currency: 'USD', quantity: 60, currentPrice: 1, valueUsd: 60 },
      { currency: 'USD', quantity: 40, currentPrice: 1, valueUsd: 40 },
      { currency: 'USD', quantity: 10, currentPrice: 0, valueUsd: 0 }, // never earmarked in practice
    ]);
    expect(r).toMatchObject({ earmarkedTotalUsd: 100, investableUsd: 200, investableTotalUsd: 300 });
  });
});
