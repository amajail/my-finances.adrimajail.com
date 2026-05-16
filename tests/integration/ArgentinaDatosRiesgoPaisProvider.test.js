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
  it('returns the first entry parsed into { basisPoints, asOf }', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: fixture }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    const result = await provider.getLatest();

    expect(result).toEqual({ basisPoints: 524, asOf: '2026-05-15' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('throws RiesgoPaisFetchError on empty array', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: [] }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    await expect(provider.getLatest()).rejects.toBeInstanceOf(RiesgoPaisFetchError);
    await expect(provider.getLatest()).rejects.toThrow(/did not contain any readings/);
  });

  it('throws RiesgoPaisFetchError on non-2xx response', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ ok: false, status: 503 }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    await expect(provider.getLatest()).rejects.toBeInstanceOf(RiesgoPaisFetchError);
    await expect(provider.getLatest()).rejects.toThrow(/non-2xx response: 503/);
  });

  it('throws RiesgoPaisFetchError when first entry is missing `valor`', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: [{ fecha: '2026-05-15' }] }));
    const provider = new ArgentinaDatosRiesgoPaisProvider({ fetcher });

    await expect(provider.getLatest()).rejects.toThrow(/has no valid `valor`/);
  });

  it('throws RiesgoPaisFetchError when first entry has malformed `fecha`', async () => {
    const fetcher = jest.fn().mockResolvedValue(fakeResponse({ json: [{ fecha: '15-05-2026', valor: 500 }] }));
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
