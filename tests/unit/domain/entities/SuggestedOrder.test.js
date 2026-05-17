/**
 * SuggestedOrder entity tests
 */

const SuggestedOrder = require('../../../../src/domain/entities/SuggestedOrder');

function fixture(overrides = {}) {
  return {
    analysisDate: '2026-05-15',
    index: 0,
    broker: 'ibkr',
    symbol: 'BRK.B',
    side: 'buy',
    quantity: 10,
    rationale: 'Standing ADD directive; framework calls this position underweight.',
    conviction: 'medium',
    ...overrides,
  };
}

describe('SuggestedOrder', () => {
  it('constructs a valid buy order', () => {
    const o = new SuggestedOrder(fixture());
    expect(o.side).toBe('buy');
    expect(o.broker).toBe('ibkr');
    expect(o.quantity).toBe(10);
  });

  it('constructs a valid sell order', () => {
    const o = new SuggestedOrder(fixture({ side: 'sell', conviction: 'high' }));
    expect(o.side).toBe('sell');
    expect(o.conviction).toBe('high');
  });

  it('rejects side = "hold" with a message pointing to the narrative', () => {
    expect(() => new SuggestedOrder(fixture({ side: 'hold' })))
      .toThrow(/hold is not a valid order side; hold commentary belongs in the narrative/);
  });

  it('rejects an unknown broker', () => {
    expect(() => new SuggestedOrder(fixture({ broker: 'mystery-broker' })))
      .toThrow(/broker must be one of/);
  });

  it('rejects zero quantity', () => {
    expect(() => new SuggestedOrder(fixture({ quantity: 0 })))
      .toThrow(/quantity must be a positive number/);
  });

  it('rejects negative quantity', () => {
    expect(() => new SuggestedOrder(fixture({ quantity: -3 })))
      .toThrow(/quantity must be a positive number/);
  });

  it('rejects a short rationale', () => {
    expect(() => new SuggestedOrder(fixture({ rationale: 'too short' })))
      .toThrow(/rationale is required and must be at least 20 characters/);
  });

  it('rejects an unknown conviction level', () => {
    expect(() => new SuggestedOrder(fixture({ conviction: 'maximum' })))
      .toThrow(/conviction must be one of/);
  });

  it('rejects a negative index', () => {
    expect(() => new SuggestedOrder(fixture({ index: -1 })))
      .toThrow(/index must be a non-negative integer/);
  });

  it('exposes id() with zero-padded rowKey', () => {
    expect(SuggestedOrder.id('2026-05-15', 3)).toEqual({
      partitionKey: '2026-05-15',
      rowKey: '03',
    });
    expect(SuggestedOrder.id('2026-05-15', 25)).toEqual({
      partitionKey: '2026-05-15',
      rowKey: '25',
    });
  });

  it('roundtrips through toJSON/fromJSON', () => {
    const original = new SuggestedOrder(fixture());
    const restored = SuggestedOrder.fromJSON(original.toJSON());
    expect(restored.toJSON()).toEqual(original.toJSON());
  });
});
