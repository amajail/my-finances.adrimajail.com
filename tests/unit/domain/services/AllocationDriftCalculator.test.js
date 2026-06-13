/**
 * AllocationDriftCalculator tests (feature 010, US1 / FR-005).
 * Drift math, membership precedence, broker narrowing, unclassified
 * reconciliation, bucket target = sum of class targets, and the
 * targets-absent → null contract.
 */

const AllocationDriftCalculator = require('../../../../src/domain/services/AllocationDriftCalculator');

const pos = (broker, assetType, symbol, valueUsd) => ({ broker, assetType, symbol, valueUsd });

const targets = () => ({
  version: 1,
  buckets: [
    {
      key: 'us', label: 'US', classes: [
        { key: 'us-etf', label: 'US — ETFs', targetPct: 25, membership: { assetTypes: ['etf'], brokers: ['ibkr'] } },
        { key: 'us-eq', label: 'US — Equities', targetPct: 25, membership: { assetTypes: ['stock'], brokers: ['ibkr'] } },
      ],
    },
    {
      key: 'arg', label: 'ARG', classes: [
        { key: 'arg-cedear', label: 'ARG — CEDEARs', targetPct: 50, membership: { assetTypes: ['cedear'] } },
      ],
    },
  ],
});

describe('AllocationDriftCalculator.computeDrift', () => {
  it('returns null when targets are absent or have no buckets', () => {
    expect(AllocationDriftCalculator.computeDrift([pos('ibkr', 'etf', 'VOO', 100)], null)).toBeNull();
    expect(AllocationDriftCalculator.computeDrift([], { buckets: [] })).toBeNull();
  });

  it('computes current % and signed drift per class', () => {
    // 50 ETF + 50 equities (ibkr) + 100 cedear = 200 total.
    const positions = [
      pos('ibkr', 'etf', 'VOO', 50),
      pos('ibkr', 'stock', 'BRK.B', 50),
      pos('iol', 'cedear', 'AAPL', 100),
    ];
    const { driftByAssetClass, driftByBucket } = AllocationDriftCalculator.computeDrift(positions, targets());

    const etf = driftByAssetClass.find((r) => r.key === 'us-etf');
    expect(etf.currentPct).toBe(25);    // 50/200
    expect(etf.driftPct).toBe(0);       // 25 - 25

    const cedear = driftByAssetClass.find((r) => r.key === 'arg-cedear');
    expect(cedear.currentPct).toBe(50); // 100/200
    expect(cedear.driftPct).toBe(0);

    // Bucket target = sum of class targets (US = 25 + 25 = 50).
    const us = driftByBucket.find((r) => r.key === 'us');
    expect(us.targetPct).toBe(50);
    expect(us.currentPct).toBe(50);     // (50+50)/200
    expect(us.driftPct).toBe(0);
  });

  it('flags over-weight (positive) and under-weight (negative) by sign', () => {
    // All 100 in ETFs → ETF over-weight, equities/cedear under-weight.
    const { driftByAssetClass } = AllocationDriftCalculator.computeDrift(
      [pos('ibkr', 'etf', 'VOO', 100)], targets()
    );
    expect(driftByAssetClass.find((r) => r.key === 'us-etf').driftPct).toBeGreaterThan(0);
    expect(driftByAssetClass.find((r) => r.key === 'us-eq').driftPct).toBeLessThan(0);
    expect(driftByAssetClass.find((r) => r.key === 'arg-cedear').driftPct).toBeLessThan(0);
  });

  it('symbols membership wins over assetTypes', () => {
    const t = {
      version: 1,
      buckets: [{
        key: 'us', label: 'US', classes: [
          { key: 'special', label: 'Special', targetPct: 50, membership: { symbols: ['VOO'] } },
          { key: 'etf', label: 'ETF', targetPct: 50, membership: { assetTypes: ['etf'] } },
        ],
      }],
    };
    const { driftByAssetClass } = AllocationDriftCalculator.computeDrift([pos('ibkr', 'etf', 'VOO', 100)], t);
    expect(driftByAssetClass.find((r) => r.key === 'special').currentUsd).toBe(100);
    expect(driftByAssetClass.find((r) => r.key === 'etf').currentUsd).toBe(0);
  });

  it('narrows by broker: an etf at the wrong broker does not match', () => {
    // ETF held at 'iol', but us-etf requires broker 'ibkr' → unclassified.
    const { driftByAssetClass, driftByBucket } = AllocationDriftCalculator.computeDrift(
      [pos('iol', 'etf', 'VOO', 100)], targets()
    );
    expect(driftByAssetClass.find((r) => r.key === 'us-etf').currentUsd).toBe(0);
    const unclassified = driftByBucket.find((r) => r.key === 'unclassified');
    expect(unclassified.currentUsd).toBe(100);
    expect(unclassified.currentPct).toBe(100);
  });

  it('reconciles to 100%: classified + unclassified current % sums to 100', () => {
    const positions = [
      pos('ibkr', 'etf', 'VOO', 40),
      pos('galicia', 'bond', 'GD35', 60), // matches nothing → unclassified
    ];
    const { driftByBucket } = AllocationDriftCalculator.computeDrift(positions, targets());
    const sum = driftByBucket.reduce((s, r) => s + r.currentPct, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it('handles an empty portfolio (0% everywhere, no divide-by-zero)', () => {
    const { driftByAssetClass } = AllocationDriftCalculator.computeDrift([], targets());
    for (const r of driftByAssetClass) expect(r.currentPct).toBe(0);
  });
});
