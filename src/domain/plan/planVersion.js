/**
 * Plan-version domain helpers (pure, no I/O).
 *
 * Validates a PlanVersionDocument (see ./plan-entities.d.ts) and expands it
 * into the Azure Table Storage rows for `portfolioTargetAllocations`,
 * `portfolioDeployRules` and `portfolioPlanVersions`. Used by
 * `scripts/seed-plan-version.js`; a future rebalance evaluator reads the same
 * shapes back.
 *
 * Modeled on docs/metaprompt-rebalance-plan.md §2/§3/§7 (C# → TS/JS).
 */

const BUCKETS = ['US', 'ARG', 'OffSystem'];
const SUM_TOLERANCE = 0.001; // metaprompt §3.1: sum(targetPct) = 1.00 ± 0.001
const DEFAULT_TOLERANCE_BAND_PCT = 0.05;

/** @param {string} bucket @param {string} assetClass */
function targetAllocationRowKey(bucket, assetClass) {
  return `${bucket}_${assetClass}`;
}

/** @param {string} bucket @param {number} priority @param {string} symbol */
function deployRuleRowKey(bucket, priority, symbol) {
  return `${bucket}_${String(priority).padStart(2, '0')}_${symbol}`;
}

/**
 * Validate a plan-version document. Returns the list of violations; empty
 * array = valid.
 *
 * @param {import('./plan-entities').PlanVersionDocument} doc
 * @returns {string[]}
 */
function validatePlanVersion(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['document must be an object'];

  if (typeof doc.version !== 'string' || !/^[A-Za-z0-9_-]+$/.test(doc.version)) {
    errors.push('version must be a non-empty key-safe string (e.g. "v3_1")');
  }
  if (typeof doc.name !== 'string' || !doc.name.trim()) {
    errors.push('name is required');
  }
  if (typeof doc.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.effectiveFrom)) {
    errors.push('effectiveFrom must be ISO YYYY-MM-DD');
  }

  const targets = Array.isArray(doc.targetAllocations) ? doc.targetAllocations : null;
  if (!targets || targets.length === 0) {
    errors.push('targetAllocations must be a non-empty array');
  } else {
    let sum = 0;
    const seen = new Set();
    for (const t of targets) {
      if (!BUCKETS.includes(t.bucket)) {
        errors.push(`targetAllocation ${t.assetClass || '?'}: bucket must be one of ${BUCKETS.join('|')}`);
      }
      if (typeof t.assetClass !== 'string' || !t.assetClass.trim()) {
        errors.push('every targetAllocation needs an assetClass');
      }
      if (typeof t.targetPct !== 'number' || Number.isNaN(t.targetPct) || t.targetPct < 0 || t.targetPct > 1) {
        errors.push(`targetAllocation ${t.assetClass || '?'}: targetPct must be a decimal fraction in [0, 1]`);
      } else {
        sum += t.targetPct;
      }
      const rk = targetAllocationRowKey(t.bucket, t.assetClass);
      if (seen.has(rk)) errors.push(`duplicate targetAllocation: ${rk}`);
      seen.add(rk);
    }
    if (Math.abs(sum - 1) > SUM_TOLERANCE) {
      errors.push(`targetPct must sum to 1.00 ± ${SUM_TOLERANCE} (got ${sum.toFixed(4)})`);
    }
  }

  const rules = Array.isArray(doc.deployRules) ? doc.deployRules : [];
  const prioritiesByBucket = new Map();
  for (const r of rules) {
    if (!BUCKETS.includes(r.bucket)) {
      errors.push(`deployRule ${r.symbol || '?'}: bucket must be one of ${BUCKETS.join('|')}`);
    }
    if (typeof r.symbol !== 'string' || !r.symbol.trim()) {
      errors.push('every deployRule needs a symbol');
    }
    if (!Number.isInteger(r.priority) || r.priority < 1) {
      errors.push(`deployRule ${r.symbol || '?'}: priority must be an integer >= 1`);
    }
    if (typeof r.rationale !== 'string' || !r.rationale.trim()) {
      errors.push(`deployRule ${r.symbol || '?'}: rationale is required`);
    }
    const key = r.bucket;
    if (!prioritiesByBucket.has(key)) prioritiesByBucket.set(key, new Set());
    if (prioritiesByBucket.get(key).has(r.priority)) {
      errors.push(`deployRule priorities must be unique per bucket (${key} priority ${r.priority} repeats)`);
    }
    prioritiesByBucket.get(key).add(r.priority);
  }

  return errors;
}

/**
 * Expand a validated document into table rows.
 *
 * @param {import('./plan-entities').PlanVersionDocument} doc
 * @returns {{
 *   planVersion: import('./plan-entities').PlanVersion,
 *   targetAllocations: import('./plan-entities').TargetAllocation[],
 *   deployRules: import('./plan-entities').DeployRule[],
 * }}
 */
function buildPlanVersionRows(doc) {
  const errors = validatePlanVersion(doc);
  if (errors.length > 0) {
    throw new Error(`invalid plan-version document: ${errors.join('; ')}`);
  }
  return {
    planVersion: {
      partitionKey: 'versions',
      rowKey: doc.version,
      name: doc.name,
      effectiveFrom: doc.effectiveFrom,
      effectiveTo: null,
      isActive: true,
      description: doc.description || '',
    },
    targetAllocations: doc.targetAllocations.map((t) => ({
      partitionKey: doc.version,
      rowKey: targetAllocationRowKey(t.bucket, t.assetClass),
      bucket: t.bucket,
      assetClass: t.assetClass,
      targetPct: t.targetPct,
      toleranceBandPct: typeof t.toleranceBandPct === 'number' ? t.toleranceBandPct : DEFAULT_TOLERANCE_BAND_PCT,
      notes: t.notes || '',
    })),
    deployRules: doc.deployRules.map((r) => ({
      partitionKey: doc.version,
      rowKey: deployRuleRowKey(r.bucket, r.priority, r.symbol),
      priority: r.priority,
      bucket: r.bucket,
      symbol: r.symbol,
      assetClass: r.assetClass,
      maxPercentOfDeployable: typeof r.maxPercentOfDeployable === 'number' ? r.maxPercentOfDeployable : null,
      minAbsoluteAmount: typeof r.minAbsoluteAmount === 'number' ? r.minAbsoluteAmount : null,
      untilClassAtTarget: r.untilClassAtTarget === true,
      rationale: r.rationale,
      active: r.active !== false,
    })),
  };
}

module.exports = {
  validatePlanVersion,
  buildPlanVersionRows,
  targetAllocationRowKey,
  deployRuleRowKey,
};
