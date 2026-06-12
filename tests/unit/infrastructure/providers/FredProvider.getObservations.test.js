/**
 * FredProvider.getObservations tests (feature 009).
 */
const FredProvider = require('../../../../src/infrastructure/providers/FredProvider');
const { FredConfigError, FredFetchError } = FredProvider;

describe('FredProvider.getObservations', () => {
  it('throws FredConfigError when no key is configured', async () => {
    await expect(new FredProvider({ apiKey: null, fetcher: jest.fn() }).getObservations('SP500', {}))
      .rejects.toBeInstanceOf(FredConfigError);
  });

  it('passes the date range, parses rows ascending, and skips "." gaps', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ observations: [
        { date: '2026-05-01', value: '5300.1' },
        { date: '2026-05-02', value: '.' },
        { date: '2026-05-03', value: '5325.4' },
      ] }),
    }));
    const out = await new FredProvider({ apiKey: 'k', fetcher }).getObservations('SP500', { start: '2026-04-01', end: '2026-05-03' });
    expect(out).toEqual([
      { date: '2026-05-01', value: 5300.1 },
      { date: '2026-05-03', value: 5325.4 },
    ]);
    const url = fetcher.mock.calls[0][0];
    expect(url).toContain('series_id=SP500');
    expect(url).toContain('observation_start=2026-04-01');
    expect(url).toContain('observation_end=2026-05-03');
    expect(url).toContain('sort_order=asc');
  });

  it('throws FredFetchError on a non-2xx response', async () => {
    const fetcher = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(new FredProvider({ apiKey: 'k', fetcher }).getObservations('CPIAUCSL', {}))
      .rejects.toBeInstanceOf(FredFetchError);
  });
});
