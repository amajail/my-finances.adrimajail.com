/**
 * QuantityChangeGuard Domain Service (feature 018)
 *
 * Pure guard math for the MCP write path's quantity-change guardrail
 * (spec FR-004): decides whether a proposed quantity change is large enough
 * to require an explicit confirmation flag.
 *
 * Rules (data-model.md §3):
 *  - Reduction to zero ALWAYS exceeds, regardless of threshold (closing out
 *    a holding is never a casual edit).
 *  - Growing from zero also exceeds (relative change is undefined —
 *    conservative).
 *  - Otherwise: |new − old| / old × 100 > thresholdPct.
 *
 * Pure and stateless — no I/O, no clock, fully unit-testable.
 */

class QuantityChangeGuard {
  /**
   * @param {number} oldQuantity - Currently stored quantity (>= 0).
   * @param {number} newQuantity - Proposed quantity (>= 0).
   * @param {number} thresholdPct - Relative-change threshold in percent (> 0).
   * @returns {{ exceeds: boolean, changePct: number|null }} changePct is null
   *   when the relative change is undefined (old quantity was zero).
   */
  static evaluate(oldQuantity, newQuantity, thresholdPct) {
    const oldQty = Number(oldQuantity);
    const newQty = Number(newQuantity);

    if (newQty === 0) {
      const changePct = oldQty > 0 ? 100 : null;
      return { exceeds: true, changePct };
    }
    if (oldQty === 0) {
      return { exceeds: true, changePct: null };
    }

    const changePct = (Math.abs(newQty - oldQty) / oldQty) * 100;
    return { exceeds: changePct > Number(thresholdPct), changePct };
  }
}

module.exports = QuantityChangeGuard;
