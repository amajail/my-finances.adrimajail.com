/**
 * GetSuggestionScorecard use-case tests (feature 007, FR-011..FR-013).
 */

const GetSuggestionScorecard = require('../../../../../src/application/use-cases/analysis/GetSuggestionScorecard');

const order = (over = {}) => ({ analysisDate: '2026-06-12', conviction: 'high', executionStatus: 'pending', ...over });

function build(orders) {
  return new GetSuggestionScorecard({ analysisRepository: { listAllOrders: jest.fn().mockResolvedValue(orders) } });
}

describe('GetSuggestionScorecard', () => {
  it('returns zeroed buckets and sufficientData:false on empty history', async () => {
    const r = await build([]).execute();
    expect(r.overall.total).toBe(0);
    expect(r.overall.executionRate).toBe(0);
    expect(r.analysesCount).toBe(0);
    expect(r.sufficientData).toBe(false);
  });

  it('computes execution rate excluding pending, overall and by conviction', async () => {
    const r = await build([
      order({ analysisDate: '2026-06-05', conviction: 'high', executionStatus: 'executed' }),
      order({ analysisDate: '2026-06-05', conviction: 'high', executionStatus: 'skipped' }),
      order({ analysisDate: '2026-06-12', conviction: 'medium', executionStatus: 'executed' }),
      order({ analysisDate: '2026-06-12', conviction: 'low', executionStatus: 'pending' }),
    ]).execute();

    expect(r.overall.total).toBe(4);
    expect(r.overall.executed).toBe(2);
    expect(r.overall.skipped).toBe(1);
    expect(r.overall.pending).toBe(1);
    // rate excludes pending: 2 executed / (2+0+1 acted) = 0.6667
    expect(r.overall.executionRate).toBeCloseTo(0.6667, 3);
    expect(r.byConviction.high.executionRate).toBeCloseTo(0.5, 3); // 1 of (1 exec + 1 skip)
    expect(r.byConviction.medium.executionRate).toBe(1);
    expect(r.byConviction.low.executionRate).toBe(0); // only a pending order → no acted
  });

  it('sufficientData flips true at 3 distinct analysis dates', async () => {
    const two = await build([
      order({ analysisDate: '2026-06-05' }), order({ analysisDate: '2026-06-12' }),
    ]).execute();
    expect(two.analysesCount).toBe(2);
    expect(two.sufficientData).toBe(false);

    const three = await build([
      order({ analysisDate: '2026-05-29' }), order({ analysisDate: '2026-06-05' }), order({ analysisDate: '2026-06-12' }),
    ]).execute();
    expect(three.analysesCount).toBe(3);
    expect(three.sufficientData).toBe(true);
  });
});
