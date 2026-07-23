/**
 * EarmarkedTotals — investable (ex-earmarked) portfolio totals.
 *
 * Pure, stateless derivation from one persisted analysis row: its
 * `portfolioTotals` plus the `earmarkedPositions` captured on the same run
 * (feature 019). No storage, no schema change — the split is recomputed on read.
 *
 * Why the charts need it: the earmarked reserve only started contributing a
 * market value once it was priced. Before that a null price made it worth 0, so
 * it never reached `portfolioTotals` even though the holding existed (its cost
 * basis WAS counted — hence the long-standing cost-vs-market gap). Charting the
 * raw grand total therefore shows a one-off step on the first priced run that is
 * not a real gain. The investable total — each row's own grand total minus that
 * row's own earmarked positions — is continuous across the change: rows written
 * before the reserve was priced carry no earmarked positions, so investable ===
 * grandTotalUsd, which is correct by construction (their grand total was built
 * from market values that already excluded the unpriced reserve).
 *
 * The per-currency sleeves are netted in NATIVE currency (quantity × price) so
 * an ARS-denominated reserve nets out of `totalArs`, not `totalUsd`; `valueUsd`
 * (already MEP-converted) is the fallback when a row carries no usable price.
 */

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Number(null) is 0, which would silently read an unpriced row as worth zero.
const finite = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

class EarmarkedTotals {
  /**
   * @param {Object|null} totals - persisted portfolioTotals ({ totalUsd, totalArs, grandTotalUsd, mepRate, … }).
   * @param {Array|null} earmarkedPositions - snapshot rows ({ quantity, currentPrice, currency, valueUsd }).
   * @returns {Object|null} totals plus `earmarkedTotalUsd`, `investableUsd`,
   *   `investableArs`, `investableTotalUsd`. Null in → null out.
   */
  static split(totals, earmarkedPositions) {
    if (!totals) return null;

    const rows = Array.isArray(earmarkedPositions) ? earmarkedPositions : [];
    const mepRate = num(totals.mepRate);
    let earmarkedTotalUsd = 0;
    let earmarkedNativeUsd = 0;
    let earmarkedNativeArs = 0;

    for (const p of rows) {
      const valueUsd = num(p.valueUsd);
      if (valueUsd <= 0) continue; // only value-bearing rows are earmarked (FR-006)
      earmarkedTotalUsd += valueUsd;

      const quantity = finite(p.quantity);
      const price = finite(p.currentPrice);
      const native = quantity !== null && price !== null ? quantity * price : null;
      if (p.currency === 'ARS') {
        earmarkedNativeArs += native !== null ? native : valueUsd * mepRate;
      } else {
        earmarkedNativeUsd += native !== null ? native : valueUsd;
      }
    }

    return {
      ...totals,
      earmarkedTotalUsd: round2(earmarkedTotalUsd),
      investableUsd: round2(num(totals.totalUsd) - earmarkedNativeUsd),
      investableArs: round2(num(totals.totalArs) - earmarkedNativeArs),
      investableTotalUsd: round2(num(totals.grandTotalUsd) - earmarkedTotalUsd),
    };
  }
}

module.exports = EarmarkedTotals;
