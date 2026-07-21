/**
 * YahooDividendEventsProvider — feature 017. Mocked client, fake data only.
 */

const YahooDividendEventsProvider = require('../../../../src/infrastructure/providers/YahooDividendEventsProvider');

const ETF = { symbol: 'DIV', assetType: 'etf', currency: 'USD' };
const CEDEAR = { symbol: 'CED', assetType: 'cedear', currency: 'ARS' };
const BOND = { symbol: 'FAKE1', assetType: 'bond', currency: 'ARS' };

function clientReturning(map) {
  return {
    quoteSummary: jest.fn(async (symbol) => {
      const entry = map[symbol];
      if (entry instanceof Error) throw entry;
      return entry;
    }),
  };
}

describe('YahooDividendEventsProvider', () => {
  it('maps calendarEvents + summaryDetail into facts with a quarterly estimate', async () => {
    const client = clientReturning({
      DIV: {
        calendarEvents: { exDividendDate: new Date('2026-08-05'), dividendDate: new Date('2026-08-20') },
        summaryDetail: { dividendRate: 2.0 },
      },
    });
    const provider = new YahooDividendEventsProvider(client);
    const result = await provider.getUpcomingDividends([ETF]);
    expect(result.sourceAvailable).toBe(true);
    expect(result.failedSymbols).toEqual([]);
    expect(result.facts).toEqual([{
      symbol: 'DIV', exDate: '2026-08-05', payDate: '2026-08-20',
      perShareAnnualRate: 2.0, perShareEstimate: 0.5,
    }]);
  });

  it('missing dividendRate → null estimate (date-only downstream, FR-008)', async () => {
    const client = clientReturning({
      DIV: { calendarEvents: { exDividendDate: new Date('2026-08-05') }, summaryDetail: {} },
    });
    const result = await new YahooDividendEventsProvider(client).getUpcomingDividends([ETF]);
    expect(result.facts[0].perShareEstimate).toBeNull();
  });

  it('cedears are looked up under the US underlying ticker; fixed income never looked up', async () => {
    const client = clientReturning({
      CED: { calendarEvents: { exDividendDate: new Date('2026-08-05') }, summaryDetail: { dividendRate: 1 } },
    });
    const provider = new YahooDividendEventsProvider(client);
    const result = await provider.getUpcomingDividends([CEDEAR, BOND]);
    expect(client.quoteSummary).toHaveBeenCalledTimes(1);
    expect(client.quoteSummary).toHaveBeenCalledWith('CED', expect.objectContaining({ modules: ['calendarEvents', 'summaryDetail'] }));
    expect(result.facts).toHaveLength(1);
  });

  it('isolates a single failing symbol (failedSymbols) while others succeed', async () => {
    const client = clientReturning({
      DIV: { calendarEvents: { exDividendDate: new Date('2026-08-05') }, summaryDetail: { dividendRate: 1 } },
      CED: new Error('boom'),
    });
    const result = await new YahooDividendEventsProvider(client).getUpcomingDividends([ETF, CEDEAR]);
    expect(result.sourceAvailable).toBe(true);
    expect(result.failedSymbols).toEqual(['CED']);
    expect(result.facts).toHaveLength(1);
  });

  it('all lookups failing → sourceAvailable false, still resolves (never rejects)', async () => {
    const client = clientReturning({ DIV: new Error('down'), CED: new Error('down') });
    const result = await new YahooDividendEventsProvider(client).getUpcomingDividends([ETF, CEDEAR]);
    expect(result.sourceAvailable).toBe(false);
    expect(result.facts).toEqual([]);
    expect(result.failedSymbols.sort()).toEqual(['CED', 'DIV']);
  });

  it('no declared dividend (no dates) is a normal outcome, not a failure', async () => {
    const client = clientReturning({ DIV: { calendarEvents: {}, summaryDetail: { dividendRate: 2 } } });
    const result = await new YahooDividendEventsProvider(client).getUpcomingDividends([ETF]);
    expect(result.facts).toEqual([]);
    expect(result.failedSymbols).toEqual([]);
    expect(result.sourceAvailable).toBe(true);
  });

  it('timeboxes slow lookups and counts them as failed', async () => {
    const client = { quoteSummary: jest.fn(() => new Promise(() => {})) }; // never resolves
    const provider = new YahooDividendEventsProvider(client, 20);
    const result = await provider.getUpcomingDividends([ETF]);
    expect(result.failedSymbols).toEqual(['DIV']);
    expect(result.sourceAvailable).toBe(false);
  });

  it('no eligible holdings → vacuously available', async () => {
    const client = clientReturning({});
    const result = await new YahooDividendEventsProvider(client).getUpcomingDividends([BOND]);
    expect(result).toEqual({ facts: [], failedSymbols: [], sourceAvailable: true });
    expect(client.quoteSummary).not.toHaveBeenCalled();
  });
});
