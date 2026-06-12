/**
 * PositionChangeCalculator tests (feature 006, US3 / FR-015..FR-017, SC-005).
 */

const PositionChangeCalculator = require('../../../../src/domain/services/PositionChangeCalculator');

const pos = (broker, assetType, symbol, quantity, extra = {}) => ({
  broker, assetType, symbol, quantity, currentPrice: 1, currency: 'USD', valueUsd: quantity, ...extra,
});

describe('PositionChangeCalculator.diff', () => {
  it('returns null when prior is null (unknown / first run)', () => {
    expect(PositionChangeCalculator.diff(null, [pos('ibkr', 'stock', 'AAA', 10)])).toBeNull();
  });

  it('returns [] when both snapshots exist but no quantity changed (price-only move)', () => {
    const prior = [pos('ibkr', 'stock', 'AAA', 10, { currentPrice: 100, valueUsd: 1000 })];
    const current = [pos('ibkr', 'stock', 'AAA', 10, { currentPrice: 999, valueUsd: 9990 })];
    expect(PositionChangeCalculator.diff(prior, current)).toEqual([]);
  });

  it('classifies added / removed / increased / reduced by quantity delta only', () => {
    const prior = [
      pos('ibkr', 'stock', 'KEEP', 10),
      pos('ibkr', 'stock', 'UP', 5),
      pos('ibkr', 'stock', 'DOWN', 20),
      pos('galicia', 'bond', 'GONE', 100),
    ];
    const current = [
      pos('ibkr', 'stock', 'KEEP', 10),   // unchanged → omitted
      pos('ibkr', 'stock', 'UP', 8),      // increased +3
      pos('ibkr', 'stock', 'DOWN', 12),   // reduced -8
      pos('ibkr', 'cedear', 'NEW', 7),    // added
    ];
    const changes = PositionChangeCalculator.diff(prior, current);
    const bySymbol = Object.fromEntries(changes.map((c) => [c.symbol, c]));

    expect(bySymbol.KEEP).toBeUndefined();
    expect(bySymbol.UP).toMatchObject({ change: 'increased', quantityBefore: 5, quantityAfter: 8, deltaQuantity: 3 });
    expect(bySymbol.DOWN).toMatchObject({ change: 'reduced', quantityBefore: 20, quantityAfter: 12, deltaQuantity: -8 });
    expect(bySymbol.NEW).toMatchObject({ change: 'added', quantityBefore: 0, quantityAfter: 7, deltaQuantity: 7 });
    expect(bySymbol.GONE).toMatchObject({ change: 'removed', quantityBefore: 100, quantityAfter: 0, deltaQuantity: -100 });
    expect(changes).toHaveLength(4);
  });

  it('matches identity on broker + assetType + symbol (same symbol, different broker = distinct)', () => {
    const prior = [pos('ibkr', 'stock', 'AAA', 10)];
    const current = [pos('galicia', 'stock', 'AAA', 10)];
    const changes = PositionChangeCalculator.diff(prior, current);
    // ibkr/AAA removed, galicia/AAA added — not treated as the same position.
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.broker === 'ibkr').change).toBe('removed');
    expect(changes.find((c) => c.broker === 'galicia').change).toBe('added');
  });

  it('ignores sub-epsilon float deltas', () => {
    const prior = [pos('ibkr', 'stock', 'AAA', 10)];
    const current = [pos('ibkr', 'stock', 'AAA', 10 + 1e-12)];
    expect(PositionChangeCalculator.diff(prior, current)).toEqual([]);
  });
});
