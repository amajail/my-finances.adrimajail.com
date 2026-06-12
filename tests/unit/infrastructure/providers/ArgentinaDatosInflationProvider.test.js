/**
 * ArgentinaDatosInflationProvider tests (feature 006).
 */

const ArgentinaDatosInflationProvider = require('../../../../src/infrastructure/providers/ArgentinaDatosInflationProvider');
const { InflationFetchError } = ArgentinaDatosInflationProvider;

describe('ArgentinaDatosInflationProvider', () => {
  it('returns the latest month-end CPI % from an ascending series', async () => {
    const fetcher = jest.fn(async () => ({
      ok: true, status: 200,
      json: async () => ([
        { fecha: '2026-03-31', valor: 2.8 },
        { fecha: '2026-04-30', valor: 2.6 },
        { fecha: '2026-05-31', valor: 2.1 },
      ]),
    }));
    const r = await new ArgentinaDatosInflationProvider({ fetcher }).getLatest();
    expect(r.percent).toBe(2.1);
    expect(r.asOf).toBe('2026-05-31');
  });

  it('throws on an empty series', async () => {
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, json: async () => ([]) }));
    await expect(new ArgentinaDatosInflationProvider({ fetcher }).getLatest()).rejects.toBeInstanceOf(InflationFetchError);
  });

  it('throws on a non-2xx response', async () => {
    const fetcher = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(new ArgentinaDatosInflationProvider({ fetcher }).getLatest()).rejects.toBeInstanceOf(InflationFetchError);
  });
});
