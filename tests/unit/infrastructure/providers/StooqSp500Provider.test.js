/**
 * StooqSp500Provider tests (feature 006, FR-006). Drawdown from true ATH.
 */

const StooqSp500Provider = require('../../../../src/infrastructure/providers/StooqSp500Provider');
const { Sp500FetchError } = StooqSp500Provider;

const CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2026-06-08,100,101,99,100,0',
  '2026-06-09,100,121,99,120,0',   // ATH close = 120
  '2026-06-10,120,121,110,114,0',  // last close = 114 → -5% from 120
].join('\n');

function textFetcher(text, { ok = true, status = 200 } = {}) {
  return jest.fn(async () => ({ ok, status, text: async () => text }));
}

describe('StooqSp500Provider', () => {
  it('computes drawdown of the last close from the all-time-high close', async () => {
    const provider = new StooqSp500Provider({ fetcher: textFetcher(CSV) });
    const r = await provider.getLatest();
    expect(r.drawdownPct).toBeCloseTo(-5, 2); // (114-120)/120*100
    expect(r.asOf).toBe('2026-06-10');
  });

  it('returns 0 drawdown when the last close is the ATH', async () => {
    const csv = ['Date,Open,High,Low,Close,Volume', '2026-06-09,1,1,1,90,0', '2026-06-10,1,1,1,100,0'].join('\n');
    const r = await new StooqSp500Provider({ fetcher: textFetcher(csv) }).getLatest();
    expect(r.drawdownPct).toBe(0);
  });

  it('throws Sp500FetchError on a body with no data rows', async () => {
    await expect(new StooqSp500Provider({ fetcher: textFetcher('Date,Open,High,Low,Close,Volume') }).getLatest())
      .rejects.toBeInstanceOf(Sp500FetchError);
  });

  it('throws Sp500FetchError on a non-2xx response', async () => {
    await expect(new StooqSp500Provider({ fetcher: textFetcher('', { ok: false, status: 500 }) }).getLatest())
      .rejects.toBeInstanceOf(Sp500FetchError);
  });
});
