/**
 * DuplicateHoldingsDetector tests (feature 014).
 * Stateless detection by shared symbol over (broker, assetType) placements;
 * cash excluded; deterministic ordering; [] when none. Fake symbols/values only.
 */

const DuplicateHoldingsDetector = require('../../../../src/domain/services/DuplicateHoldingsDetector');

const pos = (broker, assetType, symbol, quantity, valueUsd, extra = {}) =>
  ({ broker, assetType, symbol, quantity, valueUsd, ...extra });

describe('DuplicateHoldingsDetector.detect', () => {
  it('returns [] for an empty or non-array snapshot', () => {
    expect(DuplicateHoldingsDetector.detect([])).toEqual([]);
    expect(DuplicateHoldingsDetector.detect(null)).toEqual([]);
    expect(DuplicateHoldingsDetector.detect(undefined)).toEqual([]);
  });

  it('returns [] when every symbol is held in exactly one placement', () => {
    const snap = [
      pos('ibkr', 'etf', 'FUNDX', 10, 1000),
      pos('iol', 'cedear', 'CDR', 5, 500),
    ];
    expect(DuplicateHoldingsDetector.detect(snap)).toEqual([]);
  });

  it('flags the same symbol at two brokers (same wrapper) as one group', () => {
    const snap = [
      pos('ibkr', 'etf', 'FUNDX', 90, 9000),
      pos('iol', 'etf', 'FUNDX', 7, 700),
    ];
    const groups = DuplicateHoldingsDetector.detect(snap);
    expect(groups).toHaveLength(1);
    expect(groups[0].symbol).toBe('FUNDX');
    expect(groups[0].placementCount).toBe(2);
    expect(groups[0].totalValueUsd).toBe(9700);
  });

  it('flags the same underlying held via two wrappers (e.g. stock + cedear) as one group', () => {
    const snap = [
      pos('ibkr', 'stock', 'DUPE', 10, 2400),
      pos('bullmarket', 'cedear', 'DUPE', 5, 660),
    ];
    const groups = DuplicateHoldingsDetector.detect(snap);
    expect(groups).toHaveLength(1);
    expect(groups[0].placementCount).toBe(2);
    const wrappers = groups[0].placements.map((p) => p.assetType).sort();
    expect(wrappers).toEqual(['cedear', 'stock']);
  });

  it('reports three placements of one underlying as a single group of three', () => {
    const snap = [
      pos('ibkr', 'stock', 'TRI', 1, 300),
      pos('bullmarket', 'cedear', 'TRI', 1, 200),
      pos('iol', 'cedear', 'TRI', 1, 100),
    ];
    const groups = DuplicateHoldingsDetector.detect(snap);
    expect(groups).toHaveLength(1);
    expect(groups[0].placementCount).toBe(3);
  });

  it('collapses repeated (broker, assetType) into a single placement (summed), not a duplicate', () => {
    // Same instrument at the same broker twice → one placement → NOT a duplicate.
    const snap = [
      pos('ibkr', 'etf', 'SAME', 5, 500),
      pos('ibkr', 'etf', 'SAME', 5, 500),
    ];
    expect(DuplicateHoldingsDetector.detect(snap)).toEqual([]);
  });

  it('excludes cash-like asset types from detection', () => {
    const snap = [
      pos('cash', 'cash', 'USDCASH', 1000, 1000),
      pos('ibkr', 'cash', 'USDCASH', 500, 500),
      pos('galicia', 'deposit', 'PF', 1, 100),
      pos('iol', 'deposit', 'PF', 1, 100),
    ];
    expect(DuplicateHoldingsDetector.detect(snap)).toEqual([]);
  });

  it('orders groups by combined value desc, then symbol asc (deterministic)', () => {
    const snap = [
      pos('ibkr', 'etf', 'BBB', 1, 50), pos('iol', 'etf', 'BBB', 1, 50),     // total 100
      pos('ibkr', 'etf', 'AAA', 1, 500), pos('iol', 'etf', 'AAA', 1, 500),   // total 1000
      pos('ibkr', 'etf', 'CCC', 1, 500), pos('iol', 'etf', 'CCC', 1, 500),   // total 1000
    ];
    const groups = DuplicateHoldingsDetector.detect(snap);
    expect(groups.map((g) => g.symbol)).toEqual(['AAA', 'CCC', 'BBB']); // 1000(AAA<CCC), then 100
  });

  it('is deterministic: identical input yields byte-identical output', () => {
    const snap = [
      pos('ibkr', 'etf', 'DUP', 1, 100), pos('iol', 'etf', 'DUP', 1, 100),
    ];
    expect(JSON.stringify(DuplicateHoldingsDetector.detect(snap)))
      .toBe(JSON.stringify(DuplicateHoldingsDetector.detect(snap)));
  });

  it('tolerates a non-positive-value placement without crashing ordering', () => {
    const snap = [
      pos('ibkr', 'etf', 'ZED', 1, 100),
      pos('iol', 'etf', 'ZED', 1, 0),
    ];
    const groups = DuplicateHoldingsDetector.detect(snap);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalValueUsd).toBe(100);
    expect(groups[0].placementCount).toBe(2);
  });

  it('normalizes symbol case/whitespace when matching', () => {
    const snap = [
      pos('ibkr', 'stock', 'dup', 1, 100),
      pos('bullmarket', 'cedear', ' DUP ', 1, 100),
    ];
    const groups = DuplicateHoldingsDetector.detect(snap);
    expect(groups).toHaveLength(1);
    expect(groups[0].symbol).toBe('DUP');
  });

  it('uses displayName as the label when present, else the symbol', () => {
    const snap = [
      pos('ibkr', 'stock', 'DUP', 1, 100, { displayName: 'Example Co' }),
      pos('iol', 'cedear', 'DUP', 1, 100),
    ];
    expect(DuplicateHoldingsDetector.detect(snap)[0].label).toBe('Example Co');
  });
});
