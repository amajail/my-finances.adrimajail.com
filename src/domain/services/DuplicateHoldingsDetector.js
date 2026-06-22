/**
 * DuplicateHoldingsDetector (feature 014)
 *
 * Pure, stateless domain service: from the current portfolio snapshot, find every
 * underlying instrument held in 2+ distinct placements, where a placement is a
 * unique (broker, assetType) pair and underlyings are matched by shared symbol.
 * This catches BOTH the same instrument at two brokers (e.g. one ETF at two
 * brokers) AND different wrappers of the same underlying (e.g. an ADR and a
 * CEDEAR of the same ticker), in any combination (FR-001/FR-002).
 *
 * Stateless: duplicates are a property of the CURRENT portfolio only — no prior
 * analysis is needed, so it works on the first run (FR-007). Cash and
 * cash-equivalent holdings are excluded — "cash" is not a duplicated instrument
 * (FR-006). Deterministic: identical input always yields identical groups in the
 * same order (FR-013), sorted by combined value desc then symbol asc.
 *
 * Returns `[]` when there are no duplicate groups (never null — there is no
 * "unknown/first-run" state for duplicates, unlike position/macro changes).
 */

// Asset types that are not meaningfully "duplicated instruments".
const CASH_LIKE = new Set(['cash', 'deposit']);

const round2 = (n) => Math.round(n * 100) / 100;

const normalizeSymbol = (s) => String(s || '').trim().toUpperCase();

/**
 * @typedef {Object} Placement
 * @property {string} broker
 * @property {string} assetType
 * @property {number} quantity
 * @property {number} valueUsd
 */

/**
 * @typedef {Object} DuplicateGroup
 * @property {string} symbol         - the shared underlying ticker (normalized)
 * @property {string} label          - display label (displayName if present, else symbol)
 * @property {Placement[]} placements - the 2+ distinct placements, sorted by value desc
 * @property {number} placementCount  - placements.length (>= 2)
 * @property {number} totalValueUsd   - sum of placement valueUsd (>= 0, value-tolerant)
 */

class DuplicateHoldingsDetector {
  /**
   * @param {Array} snapshot - portfolio snapshot rows: { broker, assetType, symbol, quantity, valueUsd, [displayName] }
   * @returns {DuplicateGroup[]} duplicate groups (possibly []).
   */
  static detect(snapshot) {
    const rows = Array.isArray(snapshot) ? snapshot : [];

    // Group by normalized symbol, collapsing repeated (broker, assetType)
    // placements (same instrument at the same broker counts once, summed).
    const bySymbol = new Map(); // symbol -> { label, placements: Map<broker|assetType, Placement> }
    for (const r of rows) {
      if (!r || CASH_LIKE.has(r.assetType)) continue; // FR-006
      const symbol = normalizeSymbol(r.symbol);
      if (!symbol) continue;

      if (!bySymbol.has(symbol)) {
        bySymbol.set(symbol, { label: r.displayName || symbol, placements: new Map() });
      }
      const group = bySymbol.get(symbol);
      const placementKey = `${r.broker}|${r.assetType}`;
      const prior = group.placements.get(placementKey);
      const quantity = Number(r.quantity) || 0;
      const valueUsd = Number(r.valueUsd) || 0;
      if (prior) {
        prior.quantity += quantity;
        prior.valueUsd += valueUsd;
      } else {
        group.placements.set(placementKey, { broker: r.broker, assetType: r.assetType, quantity, valueUsd });
      }
    }

    const groups = [];
    for (const [symbol, { label, placements }] of bySymbol) {
      if (placements.size < 2) continue; // FR-001: 2+ distinct (broker, assetType) placements
      const list = [...placements.values()].map((p) => ({
        broker: p.broker,
        assetType: p.assetType,
        quantity: round2(p.quantity),
        valueUsd: round2(p.valueUsd),
      }));
      // Deterministic placement order: value desc, then broker asc, then assetType asc.
      list.sort((a, b) => b.valueUsd - a.valueUsd || a.broker.localeCompare(b.broker) || a.assetType.localeCompare(b.assetType));
      const totalValueUsd = round2(list.reduce((s, p) => s + p.valueUsd, 0));
      groups.push({ symbol, label, placements: list, placementCount: list.length, totalValueUsd });
    }

    // Deterministic group order: combined value desc, then symbol asc (FR-005/FR-013).
    groups.sort((a, b) => b.totalValueUsd - a.totalValueUsd || a.symbol.localeCompare(b.symbol));
    return groups;
  }
}

module.exports = DuplicateHoldingsDetector;
