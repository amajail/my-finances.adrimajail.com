/**
 * GetMacroSeries use-case tests (feature 008, FR-009/FR-010).
 */

const GetMacroSeries = require('../../../../../src/application/use-cases/analysis/GetMacroSeries');

// Minimal WeeklyAnalysis-like stub (only the getters the use-case reads).
const wa = (date, macroContext = null, portfolioTotals = null) => ({ date, macroContext, portfolioTotals });

function build(analyses) {
  return new GetMacroSeries({ analysisRepository: { getLatest: jest.fn().mockResolvedValue(analyses) } });
}

describe('GetMacroSeries', () => {
  it('returns points ascending by date (getLatest is newest-first)', async () => {
    const r = await build([wa('2026-06-12'), wa('2026-06-05'), wa('2026-05-29')]).execute({});
    expect(r.points.map((p) => p.date)).toEqual(['2026-05-29', '2026-06-05', '2026-06-12']);
    expect(r.count).toBe(3);
  });

  it('projects macroContext and portfolioTotals through', async () => {
    const macro = { riesgoPais: { value: 540, asOf: '2026-06-05', available: true } };
    const totals = { totalUsd: 100, totalArs: 200, grandTotalUsd: 101 };
    const r = await build([wa('2026-06-05', macro, totals)]).execute({});
    expect(r.points[0]).toMatchObject({ date: '2026-06-05', macroContext: macro, portfolioTotals: totals });
  });

  // Feature 019 follow-up: the charted portfolio line is invested capital, so
  // the persisted totals are augmented with the ex-earmarked split on read.
  it('adds the investable ex-earmarked split to each row\'s totals', async () => {
    const totals = { totalUsd: 300, totalArs: 200, grandTotalUsd: 400, mepRate: 1000 };
    const earmarked = [{ broker: 'cash', currency: 'USD', quantity: 100, currentPrice: 1, valueUsd: 100 }];
    const r = await build([{ ...wa('2026-07-22', null, totals), earmarkedPositions: earmarked }]).execute({});
    expect(r.points[0].portfolioTotals).toMatchObject({
      grandTotalUsd: 400,        // raw total preserved
      earmarkedTotalUsd: 100,
      investableUsd: 200,        // netted in native currency
      investableArs: 200,        // untouched by a USD reserve
      investableTotalUsd: 300,
    });
  });

  it('leaves pre-earmark rows continuous (investable === grand total)', async () => {
    const totals = { totalUsd: 300, totalArs: 200, grandTotalUsd: 400 };
    const r = await build([wa('2026-07-18', null, totals)]).execute({});
    expect(r.points[0].portfolioTotals).toMatchObject({
      earmarkedTotalUsd: 0, investableUsd: 300, investableArs: 200, investableTotalUsd: 400,
    });
  });

  it('tolerates analyses with null macro/totals (pre-feature-006)', async () => {
    const r = await build([wa('2026-01-01', null, null)]).execute({});
    expect(r.points[0]).toEqual({ date: '2026-01-01', macroContext: null, portfolioTotals: null });
  });

  it('clamps weeks and passes the limit to getLatest', async () => {
    const repo = { getLatest: jest.fn().mockResolvedValue([]) };
    const uc = new GetMacroSeries({ analysisRepository: repo });
    await uc.execute({ weeks: '999' });
    expect(repo.getLatest).toHaveBeenCalledWith(200); // clamped to MAX
    await uc.execute({ weeks: 'abc' });
    expect(repo.getLatest).toHaveBeenCalledWith(60); // default
  });

  it('returns empty cleanly', async () => {
    const r = await build([]).execute({});
    expect(r).toEqual({ points: [], count: 0 });
  });
});
