/**
 * ArgentinaDatosMepProvider — fixture-based tests.
 *
 * Tests the date-fallback lookback (today → T-1 → T-2 → …) and parse logic
 * by injecting a fake fetcher + fixed clock.
 */

const path = require('path');
const fs = require('fs');
const ArgentinaDatosMepProvider = require('../../src/infrastructure/providers/ArgentinaDatosMepProvider');
const { MepFetchError } = ArgentinaDatosMepProvider;

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'argentinadatos-mep-bolsa.json'), 'utf8')
);

function okResponse(json) {
  return { ok: true, status: 200, json: async () => json };
}
function notFoundResponse() {
  return { ok: false, status: 404, json: async () => ({}) };
}

describe('ArgentinaDatosMepProvider', () => {
  it("returns today's quote when the first lookup succeeds (rate is venta side)", async () => {
    const fetcher = jest.fn().mockResolvedValue(okResponse(fixture));
    const provider = new ArgentinaDatosMepProvider({
      fetcher,
      clock: () => new Date('2026-05-14T18:00:00Z'),
    });

    const result = await provider.getLatest();

    expect(result).toEqual({ rate: 1431.4, asOf: '2026-05-14' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toMatch(
      /api\.argentinadatos\.com\/v1\/cotizaciones\/dolares\/bolsa\/2026\/05\/14$/
    );
  });

  it('falls back to prior days when today returns 404', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(notFoundResponse()) // 2026-05-17 (today)
      .mockResolvedValueOnce(notFoundResponse()) // 2026-05-16
      .mockResolvedValueOnce(okResponse(fixture)); // 2026-05-15 → has the fixture's value

    const provider = new ArgentinaDatosMepProvider({
      fetcher,
      clock: () => new Date('2026-05-17T18:00:00Z'),
    });

    const result = await provider.getLatest();

    expect(result.rate).toBe(1431.4);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][0]).toContain('/2026/05/17');
    expect(fetcher.mock.calls[1][0]).toContain('/2026/05/16');
    expect(fetcher.mock.calls[2][0]).toContain('/2026/05/15');
  });

  it('throws MepFetchError when all lookback days return 404', async () => {
    const fetcher = jest.fn().mockResolvedValue(notFoundResponse());
    const provider = new ArgentinaDatosMepProvider({
      fetcher,
      clock: () => new Date('2026-05-14T18:00:00Z'),
    });

    await expect(provider.getLatest()).rejects.toBeInstanceOf(MepFetchError);
    await expect(provider.getLatest()).rejects.toThrow(/no MEP quote found within 6 day/);
  });

  it('rejects an array response as a regression guard', async () => {
    const fetcher = jest.fn().mockResolvedValue(okResponse([{ venta: 1431.4, fecha: '2026-05-14' }]));
    const provider = new ArgentinaDatosMepProvider({
      fetcher,
      clock: () => new Date('2026-05-14T18:00:00Z'),
    });

    await expect(provider.getLatest()).rejects.toThrow(MepFetchError);
  });

  it('rejects a response with no `venta`', async () => {
    const fetcher = jest.fn().mockResolvedValue(okResponse({ compra: 1418.8, fecha: '2026-05-14' }));
    const provider = new ArgentinaDatosMepProvider({
      fetcher,
      clock: () => new Date('2026-05-14T18:00:00Z'),
    });

    await expect(provider.getLatest()).rejects.toThrow(/no valid `venta`/);
  });
});
