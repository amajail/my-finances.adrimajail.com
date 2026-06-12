/**
 * SuggestedOrder — feature 007 execution-status fields.
 */

const SuggestedOrder = require('../../../../src/domain/entities/SuggestedOrder');

const base = (over = {}) => ({
  analysisDate: '2026-06-12', index: 0, broker: 'ibkr', symbol: 'AAA',
  side: 'buy', quantity: 10, rationale: 'A sufficiently long rationale string here.',
  conviction: 'high', ...over,
});

describe('SuggestedOrder execution status', () => {
  it('defaults executionStatus to pending and note/updatedAt to null', () => {
    const o = new SuggestedOrder(base());
    expect(o.executionStatus).toBe('pending');
    expect(o.executionNote).toBeNull();
    expect(o.executionUpdatedAt).toBeNull();
    expect(o.isMarked()).toBe(false);
  });

  it('accepts the four statuses and round-trips via toJSON/fromJSON', () => {
    const o = new SuggestedOrder(base({ executionStatus: 'executed', executionNote: 'filled', executionUpdatedAt: '2026-06-13T00:00:00Z' }));
    expect(o.isMarked()).toBe(true);
    const round = SuggestedOrder.fromJSON(o.toJSON());
    expect(round.executionStatus).toBe('executed');
    expect(round.executionNote).toBe('filled');
    expect(round.executionUpdatedAt).toBe('2026-06-13T00:00:00Z');
  });

  it('rejects an invalid executionStatus', () => {
    expect(() => new SuggestedOrder(base({ executionStatus: 'mutated' }))).toThrow();
  });

  it('rejects a note longer than 500 chars', () => {
    expect(() => new SuggestedOrder(base({ executionNote: 'x'.repeat(501) }))).toThrow();
  });

  it('exposes EXECUTION_STATUSES', () => {
    expect(SuggestedOrder.EXECUTION_STATUSES).toEqual(['pending', 'executed', 'partial', 'skipped']);
  });
});
