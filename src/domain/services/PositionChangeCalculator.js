/**
 * PositionChangeCalculator (feature 006)
 *
 * Pure domain service: computes the week-over-week position changes between two
 * portfolio snapshots, matching positions by broker + assetType + symbol and
 * classifying by QUANTITY delta only (market price moves are not changes —
 * FR-016). Returns:
 *   - null  when `prior` is null/absent (unknown — e.g. first run; FR-017).
 *   - []    when both snapshots exist but no quantity changed.
 *   - [PositionChange, ...] otherwise.
 *
 * A tiny epsilon avoids spurious changes from floating-point representation.
 */

const EPSILON = 1e-9;

/**
 * @typedef {Object} PositionChange
 * @property {string} broker
 * @property {string} assetType
 * @property {string} symbol
 * @property {'added'|'removed'|'increased'|'reduced'} change
 * @property {number} quantityBefore
 * @property {number} quantityAfter
 * @property {number} deltaQuantity
 */

class PositionChangeCalculator {
  /**
   * @param {Array|null} prior - prior snapshot positions ({broker, assetType, symbol, quantity, ...}).
   * @param {Array} current - current snapshot positions.
   * @returns {PositionChange[]|null}
   */
  static diff(prior, current) {
    if (prior === null || prior === undefined) return null;

    const key = (p) => `${p.broker}|${p.assetType}|${p.symbol}`;
    const priorMap = new Map();
    for (const p of Array.isArray(prior) ? prior : []) {
      priorMap.set(key(p), Number(p.quantity) || 0);
    }
    const currentMap = new Map();
    for (const p of Array.isArray(current) ? current : []) {
      currentMap.set(key(p), { qty: Number(p.quantity) || 0, pos: p });
    }

    const changes = [];
    const seen = new Set();

    // Positions present now (added or changed vs prior).
    for (const [k, { qty: after, pos }] of currentMap.entries()) {
      seen.add(k);
      const before = priorMap.has(k) ? priorMap.get(k) : 0;
      const delta = after - before;
      if (Math.abs(delta) < EPSILON) continue;
      let change;
      if (!priorMap.has(k)) change = 'added';
      else if (delta > 0) change = 'increased';
      else change = 'reduced';
      changes.push({
        broker: pos.broker,
        assetType: pos.assetType,
        symbol: pos.symbol,
        change,
        quantityBefore: before,
        quantityAfter: after,
        deltaQuantity: Number(delta.toFixed(10)),
      });
    }

    // Positions that disappeared (removed).
    for (const p of Array.isArray(prior) ? prior : []) {
      const k = key(p);
      if (seen.has(k)) continue;
      const before = Number(p.quantity) || 0;
      if (Math.abs(before) < EPSILON) continue;
      changes.push({
        broker: p.broker,
        assetType: p.assetType,
        symbol: p.symbol,
        change: 'removed',
        quantityBefore: before,
        quantityAfter: 0,
        deltaQuantity: Number((-before).toFixed(10)),
      });
    }

    return changes;
  }
}

module.exports = PositionChangeCalculator;
