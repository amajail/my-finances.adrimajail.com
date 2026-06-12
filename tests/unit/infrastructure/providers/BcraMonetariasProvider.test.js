/**
 * BcraMonetariasProvider tests (feature 006). Serves reserves (id 1) and the
 * policy rate (id 160) from the BCRA v4.0 nested response shape.
 */

const BcraMonetariasProvider = require('../../../../src/infrastructure/providers/BcraMonetariasProvider');
const { BcraFetchError } = BcraMonetariasProvider;

function okFetcher(detalle) {
  return jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: [{ idVariable: 1, detalle }] }),
  }));
}

describe('BcraMonetariasProvider', () => {
  it('returns the newest observation from results[0].detalle', async () => {
    const fetcher = okFetcher([
      { fecha: '2026-06-09', valor: 47834 },
      { fecha: '2026-06-06', valor: 47000 },
    ]);
    const provider = new BcraMonetariasProvider({ fetcher });
    const r = await provider.getVariable(1);
    expect(r.value).toBe(47834);
    expect(r.asOf).toBe('2026-06-09');
  });

  it('hits the v4.0 Monetarias endpoint with the variable id', async () => {
    const fetcher = okFetcher([{ fecha: '2026-06-10', valor: 29 }]);
    await new BcraMonetariasProvider({ fetcher }).getVariable(160);
    expect(fetcher.mock.calls[0][0]).toContain('/estadisticas/v4.0/Monetarias/160');
  });

  it('throws BcraFetchError when there are no observations', async () => {
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [{ detalle: [] }] }) }));
    await expect(new BcraMonetariasProvider({ fetcher }).getVariable(1)).rejects.toBeInstanceOf(BcraFetchError);
  });

  it('throws BcraFetchError on a non-2xx response (e.g. v3.0 410 Gone)', async () => {
    const fetcher = jest.fn(async () => ({ ok: false, status: 410, json: async () => ({}) }));
    await expect(new BcraMonetariasProvider({ fetcher }).getVariable(1)).rejects.toBeInstanceOf(BcraFetchError);
  });
});
