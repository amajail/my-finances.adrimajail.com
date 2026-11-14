/**
 * RerunWeeklyAnalysis — guards around the on-demand weekly run. Fake data only.
 */

const RerunWeeklyAnalysis = require('../../../../../src/application/use-cases/analysis/RerunWeeklyAnalysis');
const { AppError } = require('../../../../../src/shared/errors');

const NOW = new Date('2026-01-10T15:00:00.000Z');
const DATE = '2026-01-10';

function build({ existingStatus = null, marked = false, generated } = {}) {
  const analysisRepository = {
    getByDate: jest.fn().mockResolvedValue(
      existingStatus ? { analysis: { date: DATE, status: existingStatus }, orders: [] } : null
    ),
    hasMarkedOrders: jest.fn().mockResolvedValue(marked),
  };
  const generateWeeklyAnalysis = {
    execute: jest.fn().mockImplementation(
      generated || (async () => ({ date: DATE, status: 'completed', errorMessage: null, generatedAt: NOW }))
    ),
  };
  const useCase = new RerunWeeklyAnalysis({ analysisRepository, generateWeeklyAnalysis, clock: () => NOW });
  return { useCase, analysisRepository, generateWeeklyAnalysis };
}

describe('RerunWeeklyAnalysis', () => {
  it('runs for today when no analysis exists', async () => {
    const { useCase, generateWeeklyAnalysis } = build();
    const result = await useCase.execute();
    expect(generateWeeklyAnalysis.execute).toHaveBeenCalledWith({ targetDate: DATE });
    expect(result).toEqual({
      date: DATE, status: 'completed', errorMessage: null,
      generatedAt: NOW.toISOString(), replaced: null,
    });
  });

  it('re-runs a failed analysis without force', async () => {
    const { useCase, generateWeeklyAnalysis } = build({ existingStatus: 'failed' });
    const result = await useCase.execute();
    expect(generateWeeklyAnalysis.execute).toHaveBeenCalledTimes(1);
    expect(result.replaced).toBe('failed');
  });

  it('refuses to replace a completed analysis unless forced', async () => {
    const { useCase, generateWeeklyAnalysis } = build({ existingStatus: 'completed' });
    await expect(useCase.execute()).rejects.toMatchObject({ statusCode: 409 });
    await expect(useCase.execute({ force: 'yes' })).rejects.toBeInstanceOf(AppError);
    expect(generateWeeklyAnalysis.execute).not.toHaveBeenCalled();

    const result = await useCase.execute({ force: true });
    expect(generateWeeklyAnalysis.execute).toHaveBeenCalledTimes(1);
    expect(result.replaced).toBe('completed');
  });

  it('refuses a frozen date even when forced, before any run', async () => {
    const { useCase, generateWeeklyAnalysis } = build({ existingStatus: 'completed', marked: true });
    await expect(useCase.execute({ force: true })).rejects.toMatchObject({ statusCode: 409 });
    expect(generateWeeklyAnalysis.execute).not.toHaveBeenCalled();
  });

  it('reports a run that ends failed instead of throwing', async () => {
    const { useCase } = build({
      generated: async () => ({ date: DATE, status: 'failed', errorMessage: 'boom', generatedAt: NOW.toISOString() }),
    });
    const result = await useCase.execute();
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('boom');
  });

  it('rejects a second run while one is in flight, then frees the lock', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { useCase, generateWeeklyAnalysis } = build({
      generated: async () => { await gate; return { date: DATE, status: 'completed', generatedAt: NOW }; },
    });

    const first = useCase.execute();
    await expect(useCase.execute()).rejects.toMatchObject({ statusCode: 409 });
    release();
    await first;
    expect(generateWeeklyAnalysis.execute).toHaveBeenCalledTimes(1);

    await expect(useCase.execute()).resolves.toMatchObject({ status: 'completed' });
  });

  it('frees the lock when the run throws', async () => {
    const { useCase } = build({ generated: async () => { throw new Error('storage down'); } });
    await expect(useCase.execute()).rejects.toThrow('storage down');
    await expect(useCase.execute()).rejects.toThrow('storage down');
  });
});
