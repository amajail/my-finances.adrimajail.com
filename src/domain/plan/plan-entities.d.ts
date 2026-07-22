/**
 * Rebalance-plan entities (TypeScript models, adapted from
 * docs/metaprompt-rebalance-plan.md §2/§3/§7 — C# → TS, camelCase).
 *
 * A "strategic plan version" is the set (TargetAllocation[] + DeployRule[])
 * sharing one `partitionKey` (the version id, e.g. "v3_1"), plus one
 * PlanVersion header row. Storage:
 *
 *   - `portfolioTargetAllocations` — pk = version id, rk = `{bucket}_{assetClass}`
 *   - `portfolioDeployRules`       — pk = version id, rk = `{bucket}_{NN}_{symbol}`
 *   - `portfolioPlanVersions`      — pk = "versions", rk = version id
 *
 * Exactly ONE PlanVersion has `isActive: true` at a time; switching versions is
 * an explicit operation (seed script / future admin endpoint), never implicit.
 *
 * Invariant (metaprompt §3.1/§8): sum of `targetPct` over a version's
 * TargetAllocations must be 1.00 ± 0.001. Enforced by
 * `validatePlanVersion()` in `./planVersion.js` before any write.
 *
 * These types are consumed from JS via JSDoc, e.g.:
 *   @type {import('./plan-entities').TargetAllocation}
 */

export type Bucket = 'US' | 'ARG' | 'OffSystem';

/** Desired end-state weight for one bucket × asset class (metaprompt §3.1). */
export interface TargetAllocation {
  /** Plan version id, e.g. "v3_1". */
  partitionKey: string;
  /** `${bucket}_${assetClass}`, e.g. "US_ETF_US". */
  rowKey: string;
  bucket: Bucket;
  /** Asset-class key, e.g. "ETF_US", "ARG_SOVEREIGN_BOND". */
  assetClass: string;
  /** Decimal fraction of invested capital: 0.28 = 28%. */
  targetPct: number;
  /** Drift tolerance band, decimal (default 0.05 = ±5pp). */
  toleranceBandPct: number;
  notes: string;
}

/**
 * Priority ranking for deploying freed/incoming capital within a bucket
 * (metaprompt §3.2). When cash enters (wire, coupon, position close), the
 * evaluator walks the active version's rules in `priority` order.
 */
export interface DeployRule {
  /** Plan version id, e.g. "v3_1". */
  partitionKey: string;
  /** `${bucket}_${priority zero-padded to 2}_${symbol}`, e.g. "US_01_VOO". */
  rowKey: string;
  /** 1 = first. Unique per bucket within a version. */
  priority: number;
  bucket: Bucket;
  symbol: string;
  assetClass: string;
  /** Cap on this rule's share of the deployable cash (0.50 = 50%); null = no cap. */
  maxPercentOfDeployable: number | null;
  /** Skip the rule when the deployable amount is below this (avoids dust trades); null = no minimum. */
  minAbsoluteAmount: number | null;
  /**
   * Addition over the metaprompt schema: when true, the rule only applies while
   * its `assetClass` is below its TargetAllocation `targetPct` — expresses
   * "deploy into X until the class reaches target, then fall through".
   */
  untilClassAtTarget: boolean;
  rationale: string;
  active: boolean;
}

/** Header row for one strategic plan version (metaprompt §7). */
export interface PlanVersion {
  partitionKey: 'versions';
  /** Version id shared by the version's TargetAllocation/DeployRule rows. */
  rowKey: string;
  name: string;
  /** ISO date (YYYY-MM-DD) the version takes effect. */
  effectiveFrom: string;
  /** ISO date the version was superseded; null while current. */
  effectiveTo: string | null;
  /** Exactly one version is active at a time. */
  isActive: boolean;
  description: string;
}

/**
 * Shape of the seed document (`scripts/plan-version.local.json`) that
 * `scripts/seed-plan-version.js` validates and writes to the three tables.
 */
export interface PlanVersionDocument {
  /** Version id, e.g. "v3_1". */
  version: string;
  name: string;
  effectiveFrom: string;
  description: string;
  targetAllocations: Array<
    Pick<TargetAllocation, 'bucket' | 'assetClass' | 'targetPct'> &
      Partial<Pick<TargetAllocation, 'toleranceBandPct' | 'notes'>>
  >;
  deployRules: Array<
    Pick<DeployRule, 'priority' | 'bucket' | 'symbol' | 'assetClass' | 'rationale'> &
      Partial<Pick<DeployRule, 'maxPercentOfDeployable' | 'minAbsoluteAmount' | 'untilClassAtTarget' | 'active'>>
  >;
}
