/**
 * Unit tests for plan-version helpers (metaprompt-rebalance-plan §3.1/§8:
 * the sum-to-one invariant must be verified before saving a version).
 */

const {
  validatePlanVersion,
  buildPlanVersionRows,
  targetAllocationRowKey,
  deployRuleRowKey,
} = require('../../../../src/domain/plan/planVersion');

// Placeholder-only fixture (no real targets/amounts — Privacy First).
const validDoc = () => ({
  version: 'v9_9',
  name: 'Example plan',
  effectiveFrom: '2026-01-01',
  description: 'test fixture',
  targetAllocations: [
    { bucket: 'US', assetClass: 'ETF_US', targetPct: 0.5 },
    { bucket: 'ARG', assetClass: 'CEDEAR', targetPct: 0.5, toleranceBandPct: 0.02, notes: 'n' },
    { bucket: 'OffSystem', assetClass: 'PHYSICAL_USD_CASH', targetPct: 0, notes: 'earmarked' },
  ],
  deployRules: [
    { priority: 1, bucket: 'US', symbol: 'SYM_A', assetClass: 'ETF_US', rationale: 'first', untilClassAtTarget: true },
    { priority: 2, bucket: 'US', symbol: 'SYM_B', assetClass: 'ETF_INTL', rationale: 'second' },
  ],
});

describe('validatePlanVersion', () => {
  it('accepts a valid document', () => {
    expect(validatePlanVersion(validDoc())).toEqual([]);
  });

  it('enforces sum(targetPct) = 1.00 ± 0.001', () => {
    const doc = validDoc();
    doc.targetAllocations[0].targetPct = 0.48; // sum 0.98
    expect(validatePlanVersion(doc).join(' ')).toMatch(/sum to 1\.00/);
  });

  it('tolerates rounding inside the ±0.001 band', () => {
    const doc = validDoc();
    doc.targetAllocations[0].targetPct = 0.4995;
    doc.targetAllocations[1].targetPct = 0.5;
    expect(validatePlanVersion(doc)).toEqual([]);
  });

  it('rejects duplicate (bucket, assetClass) targets', () => {
    const doc = validDoc();
    doc.targetAllocations.push({ bucket: 'US', assetClass: 'ETF_US', targetPct: 0 });
    expect(validatePlanVersion(doc).join(' ')).toMatch(/duplicate targetAllocation: US_ETF_US/);
  });

  it('rejects duplicate deploy-rule priorities within a bucket', () => {
    const doc = validDoc();
    doc.deployRules[1].priority = 1;
    expect(validatePlanVersion(doc).join(' ')).toMatch(/unique per bucket/);
  });

  it('allows the same priority in different buckets', () => {
    const doc = validDoc();
    doc.deployRules[1] = { priority: 1, bucket: 'ARG', symbol: 'SYM_C', assetClass: 'CEDEAR', rationale: 'r' };
    expect(validatePlanVersion(doc)).toEqual([]);
  });

  it('rejects invalid buckets, version keys and dates', () => {
    const doc = validDoc();
    doc.version = 'v3.1 bad key';
    doc.effectiveFrom = '22/07/2026';
    doc.targetAllocations[0].bucket = 'EU';
    const errors = validatePlanVersion(doc).join(' ');
    expect(errors).toMatch(/key-safe/);
    expect(errors).toMatch(/YYYY-MM-DD/);
    expect(errors).toMatch(/bucket must be one of/);
  });
});

describe('buildPlanVersionRows', () => {
  it('throws on an invalid document', () => {
    const doc = validDoc();
    doc.targetAllocations = [];
    expect(() => buildPlanVersionRows(doc)).toThrow(/invalid plan-version document/);
  });

  it('expands rows with the documented keys and defaults', () => {
    const { planVersion, targetAllocations, deployRules } = buildPlanVersionRows(validDoc());

    expect(planVersion).toMatchObject({
      partitionKey: 'versions',
      rowKey: 'v9_9',
      isActive: true,
      effectiveTo: null,
      effectiveFrom: '2026-01-01',
    });

    expect(targetAllocations.map((t) => t.rowKey)).toEqual([
      'US_ETF_US',
      'ARG_CEDEAR',
      'OffSystem_PHYSICAL_USD_CASH',
    ]);
    expect(targetAllocations[0]).toMatchObject({
      partitionKey: 'v9_9',
      toleranceBandPct: 0.05, // default band
      notes: '',
    });
    expect(targetAllocations[1].toleranceBandPct).toBe(0.02);

    expect(deployRules[0]).toMatchObject({
      partitionKey: 'v9_9',
      rowKey: 'US_01_SYM_A',
      untilClassAtTarget: true,
      maxPercentOfDeployable: null,
      minAbsoluteAmount: null,
      active: true,
    });
    expect(deployRules[1].rowKey).toBe('US_02_SYM_B');
    expect(deployRules[1].untilClassAtTarget).toBe(false);
  });

  it('builds row keys with the documented format', () => {
    expect(targetAllocationRowKey('ARG', 'CER_BOND')).toBe('ARG_CER_BOND');
    expect(deployRuleRowKey('US', 3, 'SYM_A')).toBe('US_03_SYM_A');
  });
});
