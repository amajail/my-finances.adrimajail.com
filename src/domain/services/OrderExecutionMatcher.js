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

  /**
   * Feature 020: propose statuses for several pending orders against position
   * changes from multiple weeks (every week strictly after the orders were
   * issued). One position change is consumed by at most one order (greedy, in
   * the order given), so two orders never share the same fill. Never returns
   * 'skipped': no matching change means the order simply stays pending (null).
   * Weeks whose positionChanges are null/unknown are ignored.
   *
   * @param {Array<{broker:string,symbol:string,side:string,quantity:number}>} orders
   * @param {Array<{positionChanges: Array|null}>} weeks
   * @returns {Array<'executed'|'partial'|null>} aligned with `orders`
   */
  static proposeAcrossWeeks(orders, weeks) {
    const ledger = new Map();
    const remaining = (broker, symbol, side) => {
      const key = `${broker}|${symbol}|${side}`;
      if (!ledger.has(key)) {
        let total = 0;
        for (const w of Array.isArray(weeks) ? weeks : []) {
          if (!w || !Array.isArray(w.positionChanges)) continue;
          for (const c of w.positionChanges) {
            if (c.broker !== broker || c.symbol !== symbol) continue;
            const delta = Number(c.deltaQuantity) || 0;
            if (side === 'buy' && delta > EPSILON) total += delta;
            if (side === 'sell' && delta < -EPSILON) total += -delta;
          }
        }
        ledger.set(key, total);
      }
      return key;
    };

    return (Array.isArray(orders) ? orders : []).map((order) => {
      if (!order) return null;
      const key = remaining(order.broker, order.symbol, order.side);
      const available = ledger.get(key);
      const qty = Number(order.quantity) || 0;
      if (available <= EPSILON || qty <= 0) return null;
      const taken = Math.min(available, qty);
      ledger.set(key, available - taken);
      return taken + EPSILON >= qty ? 'executed' : 'partial';
    });
  }
}

module.exports = OrderExecutionMatcher;
