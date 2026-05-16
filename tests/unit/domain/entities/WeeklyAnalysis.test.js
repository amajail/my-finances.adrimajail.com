/**
 * WeeklyAnalysis entity tests
 */

const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');

const longBody = 'a'.repeat(250);

function completedFixture(overrides = {}) {
  return {
    date: '2026-05-15',
    status: 'completed',
    generatedAt: '2026-05-15T21:00:14Z',
    modelUsed: 'claude-opus-4-7',
    promptVersion: 'weekly-rebalance-v1',
    summary: 'One-paragraph executive summary describing the week.',
    markdownBody: longBody,
    riesgoPaisBp: 524,
    riesgoPaisAsOf: '2026-05-15',
    portfolioSnapshot: [],
    tokensIn: 42105,
    tokensOut: 3812,
    costUsd: 1.18,
    durationMs: 47200,
    ...overrides,
  };
}

describe('WeeklyAnalysis', () => {
  it('constructs a valid completed entity', () => {
    const wa = new WeeklyAnalysis(completedFixture());
    expect(wa.date).toBe('2026-05-15');
    expect(wa.status).toBe('completed');
    expect(wa.isCompleted()).toBe(true);
    expect(wa.isFailed()).toBe(false);
    expect(wa.riesgoPaisBp).toBe(524);
    expect(wa.tokensIn).toBe(42105);
  });

  it('constructs a valid failed entity', () => {
    const wa = new WeeklyAnalysis({
      date: '2026-05-08',
      status: 'failed',
      generatedAt: '2026-05-08T21:00:09Z',
      modelUsed: 'claude-opus-4-7',
      promptVersion: 'weekly-rebalance-v1',
      errorMessage: 'riesgo-pais source unreachable: timeout',
    });
    expect(wa.isFailed()).toBe(true);
    expect(wa.errorMessage).toBe('riesgo-pais source unreachable: timeout');
    expect(wa.summary).toBeNull();
    expect(wa.markdownBody).toBeNull();
  });

  it('rejects a failed entity without errorMessage', () => {
    expect(() => new WeeklyAnalysis({
      date: '2026-05-08',
      status: 'failed',
      modelUsed: 'claude-opus-4-7',
      promptVersion: 'weekly-rebalance-v1',
    })).toThrow(/errorMessage is required/);
  });

  it('rejects a completed entity with a short markdownBody', () => {
    expect(() => new WeeklyAnalysis(completedFixture({ markdownBody: 'too short' })))
      .toThrow(/markdownBody is required \(>= 200 chars\)/);
  });

  it('rejects a completed entity with a missing summary', () => {
    expect(() => new WeeklyAnalysis(completedFixture({ summary: undefined })))
      .toThrow(/summary is required/);
  });

  it('rejects an unknown status value', () => {
    expect(() => new WeeklyAnalysis(completedFixture({ status: 'partial' })))
      .toThrow(/status must be one of/);
  });

  it('rejects a malformed date', () => {
    expect(() => new WeeklyAnalysis(completedFixture({ date: '15-05-2026' })))
      .toThrow(/date must be ISO YYYY-MM-DD/);
  });

  it('rejects negative tokensIn', () => {
    expect(() => new WeeklyAnalysis(completedFixture({ tokensIn: -5 })))
      .toThrow(/tokensIn must be a non-negative number/);
  });

  it('exposes the static id() in Azure Tables shape', () => {
    expect(WeeklyAnalysis.id('2026-05-15')).toEqual({
      partitionKey: 'weekly',
      rowKey: '2026-05-15',
    });
  });

  it('roundtrips through toJSON/fromJSON', () => {
    const original = new WeeklyAnalysis(completedFixture());
    const restored = WeeklyAnalysis.fromJSON(original.toJSON());
    expect(restored.toJSON()).toEqual(original.toJSON());
  });

  it('freezes the portfolioSnapshot array', () => {
    const wa = new WeeklyAnalysis(completedFixture({
      portfolioSnapshot: [{ broker: 'ibkr', assetType: 'stock', symbol: 'BRK.B', quantity: 10, averageCost: 350, currentPrice: 400, currency: 'USD', valueUsd: 4000 }],
    }));
    expect(Object.isFrozen(wa.portfolioSnapshot)).toBe(true);
  });
});
