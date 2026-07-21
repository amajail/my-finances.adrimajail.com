/**
 * GetCalendarEvents — feature 017. Fake data only.
 */

const GetCalendarEvents = require('../../../../../src/application/use-cases/calendar/GetCalendarEvents');
const { ValidationError } = require('../../../../../src/shared/errors');

const TODAY = new Date('2026-07-21T15:00:00Z');

const POSITIONS = [
  { brokerId: 'iol', assetType: 'bond', symbol: 'FAKE1', quantity: 100, currentPrice: 80, currency: 'ARS', valueUsd: 55, status: 'open', maturityDate: '2026-09-01', exchange: null },
  { brokerId: 'iol', assetType: 'bond', symbol: 'NODATE', quantity: 10, currentPrice: 90, currency: 'ARS', valueUsd: 6, status: 'open', maturityDate: null, exchange: null },
  { brokerId: 'ibkr', assetType: 'etf', symbol: 'DIV', quantity: 10, currentPrice: 100, currency: 'USD', valueUsd: 1000, status: 'open', maturityDate: null, exchange: 'NYSE' },
  { brokerId: 'ibkr', assetType: 'etf', symbol: 'GONE', quantity: 1, currentPrice: 1, currency: 'USD', valueUsd: 1, status: 'closed', maturityDate: null, exchange: 'NYSE' },
];

function summaryStub(positions = POSITIONS) {
  return { execute: jest.fn().mockResolvedValue({ positions }) };
}

function providerStub(result) {
  return { getUpcomingDividends: jest.fn().mockResolvedValue(result) };
}

describe('GetCalendarEvents', () => {
  it('combines maturity + dividend events, sorted, with month groups (FR-003/FR-010)', async () => {
    const provider = providerStub({
      facts: [{ symbol: 'DIV', exDate: '2026-08-05', payDate: null, perShareAnnualRate: 2, perShareEstimate: 0.5 }],
      failedSymbols: [], sourceAvailable: true,
    });
    const useCase = new GetCalendarEvents({ getPortfolioSummary: summaryStub(), dividendEventsProvider: provider, clock: () => TODAY });
    const result = await useCase.execute({});

    expect(result.horizonDays).toBe(180);
    expect(result.dividendSourceAvailable).toBe(true);
    expect(result.fixedIncomeWithoutMaturity).toBe(1);
    expect(result.events.map((e) => e.symbol)).toEqual(['DIV', 'FAKE1']); // 08-05 before 09-01
    expect(result.months).toEqual([
      { month: '2026-08', totalUsd: 5, excludedFromTotal: 0, eventCount: 1 },
      { month: '2026-09', totalUsd: 55, excludedFromTotal: 0, eventCount: 1 },
    ]);
    // Only dividend-eligible open positions are sent to the provider.
    expect(provider.getUpcomingDividends).toHaveBeenCalledWith([expect.objectContaining({ symbol: 'DIV' })]);
  });

  it('null-amount events are excluded from month totals and counted (FR-010)', async () => {
    const provider = providerStub({
      facts: [{ symbol: 'DIV', exDate: '2026-08-05', payDate: null, perShareAnnualRate: null, perShareEstimate: null }],
      failedSymbols: [], sourceAvailable: true,
    });
    const useCase = new GetCalendarEvents({ getPortfolioSummary: summaryStub(), dividendEventsProvider: provider, clock: () => TODAY });
    const result = await useCase.execute({ days: 30 });
    expect(result.months).toEqual([{ month: '2026-08', totalUsd: 0, excludedFromTotal: 1, eventCount: 1 }]);
  });

  it('no provider wired → maturities only, dividendSourceAvailable false', async () => {
    const useCase = new GetCalendarEvents({ getPortfolioSummary: summaryStub(), clock: () => TODAY });
    const result = await useCase.execute({});
    expect(result.dividendSourceAvailable).toBe(false);
    expect(result.events.map((e) => e.type)).toEqual(['maturity']);
  });

  it('provider throwing degrades, never breaks maturities (FR-007)', async () => {
    const provider = { getUpcomingDividends: jest.fn().mockRejectedValue(new Error('down')) };
    const useCase = new GetCalendarEvents({ getPortfolioSummary: summaryStub(), dividendEventsProvider: provider, clock: () => TODAY });
    const result = await useCase.execute({});
    expect(result.dividendSourceAvailable).toBe(false);
    expect(result.events).toHaveLength(1);
  });

  it('horizon filtering respects the days parameter', async () => {
    const useCase = new GetCalendarEvents({ getPortfolioSummary: summaryStub(), clock: () => TODAY });
    const result = await useCase.execute({ days: 30 }); // FAKE1 matures in 42 days
    expect(result.events).toHaveLength(0);
  });

  it.each(['0', '401', 'abc', '1.5'])('rejects invalid days=%s with ValidationError', async (days) => {
    const useCase = new GetCalendarEvents({ getPortfolioSummary: summaryStub(), clock: () => TODAY });
    await expect(useCase.execute({ days })).rejects.toThrow(ValidationError);
  });
});
