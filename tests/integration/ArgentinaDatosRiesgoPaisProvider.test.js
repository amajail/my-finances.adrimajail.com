/**
 * ArgentinaDatosRiesgoPaisProvider — fixture-based integration tests.
 *
 * The "integration" label is for the suite location; these tests inject a
 * fake fetcher returning a recorded JSON fixture, so they don't hit the real
 * API and don't require network. Provides confidence in the parse + error
 * branches without flake.
 */

const path = require('path');
const fs = require('fs');
const ArgentinaDatosRiesgoPaisProvider = require('../../src/infrastructure/providers/ArgentinaDatosRiesgoPaisProvider');
const { RiesgoPaisFetchError } = ArgentinaDatosRiesgoPaisProvider;

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'argentinadatos-riesgo-pais.json'), 'utf8')
);

function fakeResponse({ ok = true, status = 200, json = null, throwOnJson = false } = {}) {
  return {
    ok,
    status,
    json: async () => {
      if (throwOnJson) throw new Error('invalid json');
      return json;
    },
  };
}

describe('ArgentinaDatosRiesgoPaisProvider', () => {
  it('returns the /ultimo single-object response parsed into { basisPoints, asOf }', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: fixture }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    const result = await provider.getLatest();

    expect(result).toEqual({ basisPoints: 525, asOf: '2026-05-14' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('throws RiesgoPaisFetchError when response is an array (regression guard for the bare /riesgo-pais endpoint)', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: [{ valor: 525, fecha: '2026-05-14' }] }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    await expect(provider.getLatest()).rejects.toBeInstanceOf(RiesgoPaisFetchError);
    await expect(provider.getLatest()).rejects.toThrow(/was not a single object/);
  });

  it('throws RiesgoPaisFetchError on non-2xx response', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ ok: false, status: 503 }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    await expect(provider.getLatest()).rejects.toBeInstanceOf(RiesgoPaisFetchError);
    await expect(provider.getLatest()).rejects.toThrow(/non-2xx response: 503/);
  });

  it('throws RiesgoPaisFetchError when response is missing `valor`', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: { fecha: '2026-05-14' } }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    await expect(provider.getLatest()).rejects.toThrow(/has no valid `valor`/);
  });

  it('throws RiesgoPaisFetchError when response has malformed `fecha`', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: { fecha: '14-05-2026', valor: 525 } }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    await expect(provider.getLatest()).rejects.toThrow(/has no valid `fecha`/);
  });

  it('throws RiesgoPaisFetchError on AbortError (timeout)', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetcher = jest.fn().mockRejectedValue(abortErr);
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher, timeoutMs: 50 });

    await expect(provider.getLatest()).rejects.toBeInstanceOf(RiesgoPaisFetchError);
    await expect(provider.getLatest()).rejects.toThrow(/timeout after 50ms/);
  });
});
