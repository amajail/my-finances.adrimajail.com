/**
 * OrderExecutionMatcher (feature 007)
 *
 * Pure domain service: proposes an execution status for a suggested order by
 * comparing it to the week's computed position changes (feature 006). Display-only
 * — the owner confirms before anything is saved (propose-only).
 *
 *   buy  ↔ added / increased   (deltaQuantity > 0)
 *   sell ↔ removed / reduced   (deltaQuantity < 0)
 *
 *   |matched delta| ≥ order.quantity → executed
 *   0 < |matched delta| < quantity   → partial
 *   no matching change               → skipped
 *
 * Returns null (no proposal) when positionChanges is null/unknown (FR-008).
 * Matches by broker + symbol; same-symbol collisions are matched independently
 * (accepted greedy simplification for a single-user tool).
 */

const EPSILON = 1e-9;

class OrderExecutionMatcher {
  /**
   * @param {Object} order - { broker, symbol, side, quantity }
   * @param {Array|null} positionChanges - feature 006 changes, or null (unknown).
   * @returns {'executed'|'partial'|'skipped'|null}
   */
  static propose(order, positionChanges) {
    if (positionChanges === null || positionChanges === undefined) return null;
    if (!order) return 'skipped';

    const wantIncrease = order.side === 'buy';
    const match = (Array.isArray(positionChanges) ? positionChanges : []).find((c) => {
      if (c.broker !== order.broker || c.symbol !== order.symbol) return false;
      const delta = Number(c.deltaQuantity) || 0;
      return wantIncrease ? delta > EPSILON : delta < -EPSILON;
    });

    if (!match) return 'skipped';

    const magnitude = Math.abs(Number(match.deltaQuantity) || 0);
    const qty = Number(order.quantity) || 0;
    return magnitude + EPSILON >= qty ? 'executed' : 'partial';
  }
}

module.exports = OrderExecutionMatcher;
