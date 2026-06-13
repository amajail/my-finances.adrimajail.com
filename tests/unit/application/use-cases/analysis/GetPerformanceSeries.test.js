/**
 * GetPerformanceSeries use-case tests (feature 009).
 */
const GetPerformanceSeries = require('../../../../../src/application/use-cases/analysis/GetPerformanceSeries');

const wa = (date, totals) => ({ date, portfolioTotals: totals });
const totals = (grandTotalUsd, mepRate, mepRateAsOf) => ({ grandTotalUsd, mepRate, mepRateAsOf });

function build({ analyses = [], sp500 = [], usCpi = [], arMonthly = [], fredReject = null, infReject = null } = {}) {
  const fredProvider = {
    getObservations: jest.fn(async (seriesId) => {
      if (fredReject) throw fredReject;
      return seriesId === 'SP500' ? sp500 : usCpi;
    }),
  };
  const inflationProvider = {
    getSeries: jest.fn(async () => { if (infReject) throw infReject; return arMonthly; }),
  };
  const useCase = new GetPerformanceSeries({
    analysisRepository: { getLatest: jest.fn().mockResolvedValue(analyses) },
    fredProvider,
    inflationProvider,
  });
  return { useCase, fredProvider, inflationProvider };
}

describe('GetPerformanceSeries', () => {
  it('returns empty cleanly with no analyses', async () => {
    const { useCase } = build({ analyses: [] });
    const r = await useCase.execute({});
    expect(r).toEqual({ points: [], count: 0, benchmarksAvailable: { mep: false, sp500: false, usCpi: false, arCpi: false } });
  });

  it('maps portfolio value + MEP ascending and populates benchmarks aligned on/before', async () => {
    const { useCase } = build({
      analyses: [
        wa('2026-05-15', totals(110000, 1460, '2026-05-15')),  // newest-first from getLatest
        wa('2026-05-08', totals(100000, 1450, '2026-05-08')),
      ],
      sp500: [{ date: '2026-05-07', value: 5300 }, { date: '2026-05-14', value: 5400 }],
      usCpi: [{ date: '2026-04-01', value: 320 }],
      arMonthly: [{ date: '2026-04-30', percent: 2 }, { date: '2026-05-31', percent: 3 }],
    });
    const r = await useCase.execute({});

    expect(r.points.map((p) => p.date)).toEqual(['2026-05-08', '2026-05-15']); // ascending
    expect(r.points[0].portfolioValueUsd).toBe(100000);
    expect(r.points[0].mep).toMatchObject({ value: 1450, available: true });
    expect(r.points[0].sp500).toMatchObject({ value: 5300, asOf: '2026-05-07', available: true });
    expect(r.points[1].sp500).toMatchObject({ value: 5400, available: true });
    expect(r.points[0].usCpi).toMatchObject({ value: 320, available: true });
    expect(r.benchmarksAvailable).toMatchObject({ mep: true, sp500: true, usCpi: true, arCpi: true });
  });

  it('marks a benchmark unavailable when its fetch fails (others still populate) — SC-004', async () => {
    const { useCase } = build({
      analyses: [wa('2026-05-08', totals(100000, 1450, '2026-05-08'))],
      fredReject: new Error('FRED down'),                 // both FRED series fail
      arMonthly: [{ date: '2026-04-30', percent: 2 }],
    });
    const r = await useCase.execute({});
    expect(r.benchmarksAvailable.sp500).toBe(false);
    expect(r.benchmarksAvailable.usCpi).toBe(false);
    expect(r.benchmarksAvailable.arCpi).toBe(true);       // AR still works
    expect(r.benchmarksAvailable.mep).toBe(true);         // persisted, always
    expect(r.points[0].portfolioValueUsd).toBe(100000);
  });

  it('clamps weeks and tolerates analyses with null totals', async () => {
    const repo = { getLatest: jest.fn().mockResolvedValue([wa('2026-05-08', null)]) };
    const useCase = new GetPerformanceSeries({
      analysisRepository: repo,
      fredProvider: { getObservations: jest.fn().mockResolvedValue([]) },
      inflationProvider: { getSeries: jest.fn().mockResolvedValue([]) },
    });
    const r = await useCase.execute({ weeks: '999' });
    expect(repo.getLatest).toHaveBeenCalledWith(200);
    expect(r.points[0].portfolioValueUsd).toBeNull();
    expect(r.points[0].mep.available).toBe(false);
  });
});
