/**
 * SuggestedOrder — feature 018 optional executionPrice.
 */

const SuggestedOrder = require('../../../../src/domain/entities/SuggestedOrder');
const { ValidationError } = require('../../../../src/shared/errors');

function base(over = {}) {
  return {
    analysisDate: '2026-06-12',
    index: 0,
    broker: 'ibkr',
    symbol: 'AAA',
    side: 'buy',
    quantity: 10,
    rationale: 'A sufficiently long rationale string here.',
    conviction: 'high',
    ...over,
  };
}

describe('SuggestedOrder executionPrice', () => {
  it('defaults to null when absent', () => {
    const order = new SuggestedOrder(base());
    expect(order.executionPrice).toBeNull();
    expect(order.toJSON().executionPrice).toBeNull();
  });

  it('accepts a positive number and round-trips through toJSON/fromJSON', () => {
    const order = new SuggestedOrder(base({ executionPrice: 42.5 }));
    expect(order.executionPrice).toBe(42.5);
    expect(SuggestedOrder.fromJSON(order.toJSON()).executionPrice).toBe(42.5);
  });

  it('coerces a numeric string', () => {
    expect(new SuggestedOrder(base({ executionPrice: '42.50' })).executionPrice).toBe(42.5);
  });

  it('rejects zero, negative, and non-numeric prices', () => {
    expect(() => new SuggestedOrder(base({ executionPrice: 0 }))).toThrow(ValidationError);
    expect(() => new SuggestedOrder(base({ executionPrice: -5 }))).toThrow(ValidationError);
    expect(() => new SuggestedOrder(base({ executionPrice: 'abc' }))).toThrow('executionPrice must be a positive number');
  });
});
