/**
 * OrderExecutionMatcher tests (feature 007, FR-006/FR-008, SC-004).
 */

const OrderExecutionMatcher = require('../../../../src/domain/services/OrderExecutionMatcher');

const order = (over = {}) => ({ broker: 'ibkr', symbol: 'AAA', side: 'buy', quantity: 10, ...over });
const change = (over = {}) => ({ broker: 'ibkr', assetType: 'stock', symbol: 'AAA', change: 'increased', deltaQuantity: 10, ...over });

describe('OrderExecutionMatcher.propose', () => {
  it('returns null when positionChanges is null (unknown / first run)', () => {
    expect(OrderExecutionMatcher.propose(order(), null)).toBeNull();
  });

  it('proposes executed when a same-direction change ≥ quantity exists', () => {
    expect(OrderExecutionMatcher.propose(order({ quantity: 10 }), [change({ deltaQuantity: 12 })])).toBe('executed');
    expect(OrderExecutionMatcher.propose(order({ quantity: 10 }), [change({ deltaQuantity: 10 })])).toBe('executed');
  });

  it('proposes partial when the change is same-direction but smaller', () => {
    expect(OrderExecutionMatcher.propose(order({ quantity: 10 }), [change({ deltaQuantity: 4 })])).toBe('partial');
  });

  it('proposes skipped when no matching change exists ([] = nothing changed)', () => {
    expect(OrderExecutionMatcher.propose(order(), [])).toBe('skipped');
    expect(OrderExecutionMatcher.propose(order({ symbol: 'AAA' }), [change({ symbol: 'BBB' })])).toBe('skipped');
  });

  it('matches sell against a decrease (negative delta)', () => {
    const sell = order({ side: 'sell', quantity: 5 });
    expect(OrderExecutionMatcher.propose(sell, [change({ change: 'reduced', deltaQuantity: -8 })])).toBe('executed');
    expect(OrderExecutionMatcher.propose(sell, [change({ change: 'reduced', deltaQuantity: -2 })])).toBe('partial');
    // A sell matched against an increase is NOT a match → skipped.
    expect(OrderExecutionMatcher.propose(sell, [change({ change: 'increased', deltaQuantity: 8 })])).toBe('skipped');
  });

  it('matches on broker + symbol (different broker, same symbol = no match)', () => {
    expect(OrderExecutionMatcher.propose(order({ broker: 'ibkr' }), [change({ broker: 'galicia' })])).toBe('skipped');
  });
});

describe('OrderExecutionMatcher.proposeAcrossWeeks (feature 020)', () => {
  const buy = (over = {}) => ({ broker: 'BROKER', symbol: 'SYMBOL', side: 'buy', quantity: 5, ...over });
  const wk = (...deltas) => ({
    positionChanges: deltas.map((d) => ({ broker: 'BROKER', symbol: 'SYMBOL', change: d > 0 ? 'increased' : 'reduced', deltaQuantity: d })),
  });

  it('proposes executed when summed later increases cover the quantity', () => {
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy()], [wk(3), wk(2)])).toEqual(['executed']);
  });

  it('proposes partial for a smaller increase', () => {
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy()], [wk(1)])).toEqual(['partial']);
  });

  it('returns null (never skipped) when nothing matches', () => {
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy()], [wk(), wk()])).toEqual([null]);
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy()], [])).toEqual([null]);
  });

  it('ignores weeks whose changes are unknown (null)', () => {
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy()], [{ positionChanges: null }, wk(5)])).toEqual(['executed']);
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy()], [{ positionChanges: null }])).toEqual([null]);
  });

  it('never lets an opposite-direction change satisfy an order', () => {
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy()], [wk(-5)])).toEqual([null]);
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy({ side: 'sell' })], [wk(-5)])).toEqual(['executed']);
  });

  it('does not count one change toward two orders', () => {
    const res = OrderExecutionMatcher.proposeAcrossWeeks([buy(), buy({ quantity: 5 })], [wk(6)]);
    expect(res).toEqual(['executed', 'partial']);
  });

  it('matches on broker as well as symbol', () => {
    expect(OrderExecutionMatcher.proposeAcrossWeeks([buy({ broker: 'OTHER' })], [wk(5)])).toEqual([null]);
  });
});
