/**
 * FredSp500DrawdownProvider tests (feature 006). Drawdown from the FRED SP500
 * series (used when Stooq's keyless CSV is unavailable).
 */

const FredSp500DrawdownProvider = require('../../../../src/infrastructure/providers/FredSp500DrawdownProvider');
const { FredConfigError, FredFetchError } = require('../../../../src/infrastructure/providers/FredProvider');

function obsFetcher(observations, { ok = true, status = 200 } = {}) {
  return jest.fn(async () => ({ ok, status, json: async () => ({ observations }) }));
}

describe('FredSp500DrawdownProvider', () => {
  it('throws FredConfigError when no key is configured', async () => {
    await expect(new FredSp500DrawdownProvider({ apiKey: null, fetcher: jest.fn() }).getLatest())
      .rejects.toBeInstanceOf(FredConfigError);
  });

  it('computes drawdown of the last close from the max close, skipping "." gaps', async () => {
    const fetcher = obsFetcher([
      { date: '2026-06-05', value: '5000' },
      { date: '2026-06-06', value: '.' },      // missing — skipped
      { date: '2026-06-07', value: '6000' },   // high
      { date: '2026-06-08', value: '5700' },   // last → (5700-6000)/6000 = -5%
    ]);
    const r = await new FredSp500DrawdownProvider({ apiKey: 'k', fetcher }).getLatest();
    expect(r.drawdownPct).toBeCloseTo(-5, 2);
    expect(r.asOf).toBe('2026-06-08');
    expect(fetcher.mock.calls[0][0]).toContain('series_id=SP500');
  });

  it('throws FredFetchError on a non-2xx response', async () => {
    await expect(new FredSp500DrawdownProvider({ apiKey: 'k', fetcher: obsFetcher([], { ok: false, status: 500 }) }).getLatest())
      .rejects.toBeInstanceOf(FredFetchError);
  });

  it('throws FredFetchError when the series has no usable values', async () => {
    await expect(new FredSp500DrawdownProvider({ apiKey: 'k', fetcher: obsFetcher([{ date: '2026-06-08', value: '.' }]) }).getLatest())
      .rejects.toBeInstanceOf(FredFetchError);
  });
});
