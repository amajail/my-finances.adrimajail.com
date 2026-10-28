/**
 * PendingOrderTracker (feature 020)
 *
 * Pure domain service: links the same suggested order (broker + symbol + side)
 * across consecutive completed weekly analyses and reports how long it has been
 * pending. The weekly analysis uses the result to label carry-overs and to
 * escalate orders that keep coming back unrecorded instead of re-issuing them.
 *
 *   chain  = consecutive weeks (newest prior week first) in which the key has a
 *            `pending` order, or an unresolved confirmation item carried forward
 *   age    = number of such weeks (capped at MAX_LOOKBACK_WEEKS)
 *   reason = 'likely-filled' (later position changes show the fill)
 *          | 'stale'         (age >= MAX_CONSECUTIVE_ISSUES: a repeat would be the 4th)
 *          | 'fresh'         (still allowed as a labelled carry-over)
 *
 * A confirmation item stays in its chain until the order row it points to is
 * recorded as executed/partial/skipped, so escalating an order cannot end its
 * chain (otherwise it would return as "new" the following week).
 */

const OrderExecutionMatcher = require('./OrderExecutionMatcher');

const MAX_CONSECUTIVE_ISSUES = 3;
const MAX_LOOKBACK_WEEKS = 8;

function keyOf(o) {
  return `${o.broker}|${o.symbol}|${o.side}`;
}

class PendingOrderTracker {
  /**
   * @param {Object} input
   * @param {string} input.targetDate - ISO date of the run being generated.
   * @param {Array<{date:string,status:string,positionChanges:Array|null,orders:Array,confirmationItems?:Array}>} input.analyses
   * @param {Array|null} [input.currentPositionChanges] - the target week's own
   *   position changes (they reflect what happened since the prior run).
   * @returns {Array<Object>} chains, newest-first by lastDate then key
   */
  static build({ targetDate, analyses, currentPositionChanges = null }) {
    const weeks = (Array.isArray(analyses) ? analyses : [])
      .filter((a) => a && a.status === 'completed' && a.date < targetDate)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, MAX_LOOKBACK_WEEKS);
    if (weeks.length === 0) return [];

    const byDate = new Map(weeks.map((w) => [w.date, w]));
    const isResolved = (item) => {
      const w = byDate.get(item.lastDate);
      if (!w) return false; // outside the window: treat as unresolved
      const row = (w.orders || []).find((o) => o.index === item.lastIndex);
      return !!row && (row.executionStatus || 'pending') !== 'pending';
    };

    // Candidate keys come from the newest prior week only: a chain must reach it.
    const newest = weeks[0];
    const candidates = new Map();
    for (const o of newest.orders || []) {
      if ((o.executionStatus || 'pending') === 'pending') candidates.set(keyOf(o), true);
    }
    for (const it of newest.confirmationItems || []) candidates.set(keyOf(it), true);

    const chains = [];
    for (const key of candidates.keys()) {
      let age = 0;
      let last = null;
      let originDate = null;
      for (const w of weeks) {
        const item = (w.confirmationItems || []).find((it) => keyOf(it) === key);
        const order = (w.orders || []).find((o) => keyOf(o) === key && (o.executionStatus || 'pending') === 'pending');
        if (item) {
          if (isResolved(item)) break;
          if (!last) last = { date: item.lastDate, index: item.lastIndex, quantity: item.quantity, broker: item.broker, symbol: item.symbol, side: item.side };
          originDate = item.originDate && item.originDate < w.date ? item.originDate : w.date;
          age += 1;
        } else if (order) {
          if (!last) last = { date: w.date, index: order.index, quantity: order.quantity, broker: order.broker, symbol: order.symbol, side: order.side };
          originDate = w.date;
          age += 1;
        } else {
          break;
        }
      }
      if (age === 0 || !last) continue;

      const laterWeeks = weeks
        .filter((w) => w.date > originDate)
        .map((w) => ({ positionChanges: w.positionChanges }));
      laterWeeks.push({ positionChanges: currentPositionChanges });
      const [proposedStatus] = OrderExecutionMatcher.proposeAcrossWeeks(
        [{ broker: last.broker, symbol: last.symbol, side: last.side, quantity: last.quantity }],
        laterWeeks,
      );

      const ageWeeks = Math.min(age, MAX_LOOKBACK_WEEKS);
      let reason = 'fresh';
      if (proposedStatus) reason = 'likely-filled';
      else if (ageWeeks >= MAX_CONSECUTIVE_ISSUES) reason = 'stale';

      chains.push({
        key,
        broker: last.broker,
        symbol: last.symbol,
        side: last.side,
        originDate,
        lastDate: last.date,
        lastIndex: last.index,
        ageWeeks,
        lastQuantity: last.quantity,
        proposedStatus: proposedStatus || null,
        reason,
      });
    }
    return chains;
  }

  /**
   * Confirmation items for the chains that must not be re-issued as normal orders.
   * @param {Array<Object>} chains - result of build()
   */
  static confirmationItems(chains) {
    return (chains || [])
      .filter((c) => c.reason !== 'fresh')
      .map((c) => ({
        broker: c.broker,
        symbol: c.symbol,
        side: c.side,
        quantity: c.lastQuantity,
        ageWeeks: c.ageWeeks,
        originDate: c.originDate,
        lastDate: c.lastDate,
        lastIndex: c.lastIndex,
        reason: c.reason,
        proposedStatus: c.proposedStatus,
      }));
  }
}

module.exports = PendingOrderTracker;
module.exports.MAX_CONSECUTIVE_ISSUES = MAX_CONSECUTIVE_ISSUES;
module.exports.MAX_LOOKBACK_WEEKS = MAX_LOOKBACK_WEEKS;
module.exports.keyOf = keyOf;
