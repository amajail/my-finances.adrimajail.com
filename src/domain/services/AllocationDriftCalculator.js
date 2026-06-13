/**
 * AllocationDriftCalculator
 *
 * Pure domain service (no I/O). Given the current open positions (each carrying
 * a `valueUsd`) and a machine-readable allocation-targets document, it computes:
 *
 *   - driftByBucket[]       — per strategy bucket: target/current %, signed drift
 *   - driftByAssetClass[]   — per (bucket,class): target/current %, signed drift
 *
 * Membership resolution per position, in priority order:
 *   1. a class whose `membership.symbols` contains the position's symbol
 *   2. else a class whose `membership.assetTypes` contains its assetType AND
 *      whose `membership.brokers` is empty or contains its broker
 *   3. else a synthetic `unclassified` row, so current weights always
 *      reconcile to 100% (nothing is silently dropped).
 *
 * Over/under-weight is the SIGN of the drift (FR-005, no tolerance band):
 * driftPct > 0 → over-weight, < 0 → under-weight, 0 → on-target.
 *
 * Feature: 010-structured-analysis-tables.
 */

const round = (n) => Math.round(n * 100) / 100; // 2 dp, percentages and USD

/**
 * @typedef {Object} Position
 * @property {string} broker
 * @property {string} assetType
 * @property {string} symbol
 * @property {number} valueUsd
 */

class AllocationDriftCalculator {
  /**
   * Resolve which class key a position belongs to.
   * @returns {string|null} classKey, or null if no rule matched.
   * @private
   */
  static _classKeyFor(position, classes) {
    const symbol = position.symbol;
    // 1. explicit symbol match wins
    for (const c of classes) {
      const m = c.membership || {};
      if (Array.isArray(m.symbols) && symbol && m.symbols.includes(symbol)) {
        return c.key;
      }
    }
    // 2. assetType (+ optional broker narrowing)
    for (const c of classes) {
      const m = c.membership || {};
      const typeOk = Array.isArray(m.assetTypes) && m.assetTypes.includes(position.assetType);
      if (!typeOk) continue;
      const brokerOk = !Array.isArray(m.brokers) || m.brokers.length === 0 || m.brokers.includes(position.broker);
      if (brokerOk) return c.key;
    }
    return null;
  }

  /**
   * Compute bucket-level and asset-class-level drift.
   *
   * @param {Position[]} positions
   * @param {{ buckets: Array }} targets - parsed allocation-targets document
   * @returns {{ driftByBucket: Array, driftByAssetClass: Array }|null}
   *   null when targets are absent/empty (caller omits the sections).
   */
  static computeDrift(positions, targets) {
    if (!targets || !Array.isArray(targets.buckets) || targets.buckets.length === 0) {
      return null;
    }
    const pos = Array.isArray(positions) ? positions : [];

    // Flatten classes with a back-reference to their bucket, and index by key.
    const classIndex = new Map(); // classKey -> { bucket, class }
    for (const bucket of targets.buckets) {
      for (const cls of bucket.classes || []) {
        classIndex.set(cls.key, { bucket, class: cls });
      }
    }
    const allClasses = [...classIndex.values()].map((e) => e.class);

    const grandTotal = pos.reduce((s, p) => s + (Number(p.valueUsd) || 0), 0);
    const pct = (usd) => (grandTotal > 0 ? round((usd / grandTotal) * 100) : 0);

    // Current USD per class key (+ unclassified bucket-less bucket).
    const currentByClass = new Map();
    const currentByBucket = new Map();
    let unclassifiedUsd = 0;
    for (const p of pos) {
      const usd = Number(p.valueUsd) || 0;
      const classKey = this._classKeyFor(p, allClasses);
      if (classKey === null) {
        unclassifiedUsd += usd;
        continue;
      }
      currentByClass.set(classKey, (currentByClass.get(classKey) || 0) + usd);
      const bucketKey = classIndex.get(classKey).bucket.key;
      currentByBucket.set(bucketKey, (currentByBucket.get(bucketKey) || 0) + usd);
    }

    // Asset-class rows (one per defined class).
    const driftByAssetClass = [];
    for (const bucket of targets.buckets) {
      for (const cls of bucket.classes || []) {
        const currentUsd = currentByClass.get(cls.key) || 0;
        const targetPct = Number(cls.targetPct) || 0;
        const currentPct = pct(currentUsd);
        driftByAssetClass.push({
          key: cls.key,
          label: cls.label,
          targetPct: round(targetPct),
          currentPct,
          driftPct: round(currentPct - targetPct),
          currentUsd: round(currentUsd),
        });
      }
    }

    // Bucket rows (bucket target = sum of its class targets).
    const driftByBucket = targets.buckets.map((bucket) => {
      const targetPct = (bucket.classes || []).reduce((s, c) => s + (Number(c.targetPct) || 0), 0);
      const currentUsd = currentByBucket.get(bucket.key) || 0;
      const currentPct = pct(currentUsd);
      return {
        key: bucket.key,
        label: bucket.label,
        targetPct: round(targetPct),
        currentPct,
        driftPct: round(currentPct - targetPct),
        currentUsd: round(currentUsd),
      };
    });

    // Surface unclassified holdings so weights reconcile to 100%.
    if (unclassifiedUsd > 0) {
      const currentPct = pct(unclassifiedUsd);
      const row = {
        key: 'unclassified',
        label: 'Unclassified',
        targetPct: 0,
        currentPct,
        driftPct: currentPct,
        currentUsd: round(unclassifiedUsd),
      };
      driftByBucket.push(row);
      driftByAssetClass.push(row);
    }

    return { driftByBucket, driftByAssetClass };
  }

  /**
   * Build a [{ position, classKey, bucketKey }] assignment list (bucketKey/
   * classKey null when unclassified).
   * @private
   */
  static _assign(positions, targets) {
    const classIndex = new Map();
    for (const bucket of targets.buckets) {
      for (const cls of bucket.classes || []) {
        classIndex.set(cls.key, bucket.key);
      }
    }
    const allClasses = targets.buckets.flatMap((b) => b.classes || []);
    return positions.map((p) => {
      const classKey = this._classKeyFor(p, allClasses);
      return { position: p, classKey, bucketKey: classKey ? classIndex.get(classKey) : null };
    });
  }

  /**
   * Does a position match a cap's single `match` dimension?
   * @private
   */
  static _matchesCap(assignment, match) {
    if (!match || typeof match !== 'object') return false;
    const p = assignment.position;
    if (match.symbol !== undefined) return p.symbol === match.symbol;
    if (match.assetType !== undefined) return p.assetType === match.assetType;
    if (match.classKey !== undefined) return assignment.classKey === match.classKey;
    if (match.bucketKey !== undefined) return assignment.bucketKey === match.bucketKey;
    return false;
  }

  /**
   * Evaluate concentration caps from the targets document.
   *
   * @param {Position[]} positions
   * @param {{ buckets: Array, concentrationCaps?: Array }} targets
   * @returns {Array|null} concentrationCaps rows, or null when no caps are
   *   defined or targets are absent (caller omits the section). Distinct from
   *   `[]`, which this never returns.
   */
  static computeConcentrationCaps(positions, targets) {
    if (!targets || !Array.isArray(targets.buckets) || !Array.isArray(targets.concentrationCaps) || targets.concentrationCaps.length === 0) {
      return null;
    }
    const pos = Array.isArray(positions) ? positions : [];
    const assignments = this._assign(pos, targets);
    const grandTotal = pos.reduce((s, p) => s + (Number(p.valueUsd) || 0), 0);
    const usdOf = (a) => Number(a.position.valueUsd) || 0;

    return targets.concentrationCaps.map((cap) => {
      // Denominator: portfolio grand total, or the bucket's total value.
      let denom = grandTotal;
      if (cap.scope === 'bucket') {
        denom = assignments
          .filter((a) => a.bucketKey === cap.bucketKey)
          .reduce((s, a) => s + usdOf(a), 0);
      }
      const numer = assignments
        .filter((a) => this._matchesCap(a, cap.match))
        .reduce((s, a) => s + usdOf(a), 0);
      const currentPct = denom > 0 ? round((numer / denom) * 100) : 0;

      let breach = 'none';
      if (typeof cap.hardPct === 'number' && currentPct > cap.hardPct) {
        breach = 'hard';
      } else if (typeof cap.softPct === 'number' && currentPct > cap.softPct) {
        breach = 'soft';
      }

      return {
        label: cap.label,
        scope: cap.scope,
        bucketKey: cap.scope === 'bucket' ? (cap.bucketKey || null) : null,
        softPct: typeof cap.softPct === 'number' ? round(cap.softPct) : null,
        hardPct: typeof cap.hardPct === 'number' ? round(cap.hardPct) : null,
        currentPct,
        breach,
      };
    });
  }
}

module.exports = AllocationDriftCalculator;
