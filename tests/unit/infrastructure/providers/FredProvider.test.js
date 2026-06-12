/**
 * FredProvider tests (feature 006). US CPI YoY (units=pc1) + Fed funds upper.
 */

const FredProvider = require('../../../../src/infrastructure/providers/FredProvider');
const { FredConfigError, FredFetchError } = FredProvider;

describe('FredProvider', () => {
  it('throws FredConfigError when no API key is configured', async () => {
    const provider = new FredProvider({ apiKey: null, fetcher: jest.fn() });
    await expect(provider.getLatestObservation('CPIAUCSL', { units: 'pc1' })).rejects.toBeInstanceOf(FredConfigError);
  });

  it('passes series_id + units and returns the latest observation', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ observations: [{ date: '2026-05-01', value: '3.1' }] }),
    }));
    const provider = new FredProvider({ apiKey: 'key', fetcher });
    const r = await provider.getLatestObservation('CPIAUCSL', { units: 'pc1' });
    expect(r.value).toBe(3.1);
    expect(r.asOf).toBe('2026-05-01');
    const url = fetcher.mock.calls[0][0];
    expect(url).toContain('series_id=CPIAUCSL');
    expect(url).toContain('units=pc1');
    expect(url).toContain('api_key=key');
  });

  it('throws FredFetchError when the latest value is "." (missing)', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ observations: [{ date: '2026-05-01', value: '.' }] }),
    }));
    await expect(new FredProvider({ apiKey: 'k', fetcher }).getLatestObservation('DFEDTARU')).rejects.toBeInstanceOf(FredFetchError);
  });

  it('throws FredFetchError on a non-2xx response', async () => {
    const fetcher = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(new FredProvider({ apiKey: 'k', fetcher }).getLatestObservation('DFEDTARU')).rejects.toBeInstanceOf(FredFetchError);
  });
});
