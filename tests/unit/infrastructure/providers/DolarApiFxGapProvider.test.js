/**
 * DolarApiFxGapProvider tests (feature 006, FR-005).
 */

const DolarApiFxGapProvider = require('../../../../src/infrastructure/providers/DolarApiFxGapProvider');
const { FxGapFetchError } = DolarApiFxGapProvider;

function fetcherFor(map) {
  return jest.fn(async (url) => {
    const key = url.includes('/oficial') ? 'oficial' : 'bolsa';
    const entry = map[key];
    if (entry.throw) throw entry.throw;
    return {
      ok: entry.ok !== false,
      status: entry.status || 200,
      json: async () => entry.body,
    };
  });
}

describe('DolarApiFxGapProvider', () => {
  it('computes the gap % from oficial.venta and bolsa.venta', async () => {
    const fetcher = fetcherFor({
      oficial: { body: { venta: 1450, fechaActualizacion: '2026-06-11T17:00:00.000Z' } },
      bolsa: { body: { venta: 1454.2, fechaActualizacion: '2026-06-11T17:05:00.000Z' } },
    });
    const provider = new DolarApiFxGapProvider({ fetcher });
    const r = await provider.getLatest();
    expect(r.gapPct).toBeCloseTo(0.29, 2);
    expect(r.asOf).toBe('2026-06-11');
  });

  it('throws FxGapFetchError on a non-2xx leg', async () => {
    const fetcher = fetcherFor({
      oficial: { ok: false, status: 503, body: {} },
      bolsa: { body: { venta: 1454, fechaActualizacion: '2026-06-11T00:00:00Z' } },
    });
    await expect(new DolarApiFxGapProvider({ fetcher }).getLatest()).rejects.toBeInstanceOf(FxGapFetchError);
  });

  it('throws when a venta value is missing', async () => {
    const fetcher = fetcherFor({
      oficial: { body: { venta: 0 } },
      bolsa: { body: { venta: 1454, fechaActualizacion: '2026-06-11T00:00:00Z' } },
    });
    await expect(new DolarApiFxGapProvider({ fetcher }).getLatest()).rejects.toBeInstanceOf(FxGapFetchError);
  });
});
