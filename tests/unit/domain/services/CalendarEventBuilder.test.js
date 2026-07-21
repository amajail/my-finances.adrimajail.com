/**
 * CalendarEventBuilder — feature 017. Fake data only.
 */

const CalendarEventBuilder = require('../../../../src/domain/services/CalendarEventBuilder');

const TODAY = new Date('2026-07-21T15:00:00Z');

function pos(overrides = {}) {
  return {
    brokerId: 'iol', assetType: 'bond', symbol: 'FAKE1', quantity: 100,
    averageCost: 50, currentPrice: 80, currency: 'ARS', valueUsd: 55.17,
    status: 'open', maturityDate: '2026-09-01', exchange: null, ...overrides,
  };
}

describe('CalendarEventBuilder', () => {
  it('derives maturity events inside the horizon with per-100 native amounts and valueUsd estimates', () => {
    const { events, fixedIncomeWithoutMaturity } = CalendarEventBuilder.build({
      positions: [pos()], dividendFacts: [], horizonDays: 180, today: TODAY,
    });
    expect(fixedIncomeWithoutMaturity).toBe(0);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('maturity');
    expect(e.date).toBe('2026-09-01');
    expect(e.daysUntil).toBe(42);
    expect(e.overdue).toBe(false);
    expect(e.amountNative).toBe(80); // 100 nominales × 80/100
    expect(e.amountUsd).toBe(55.17); // reuses valueUsd (research D3)
    expect(e.estimated).toBe(true);
  });

  it('excludes maturities beyond the horizon but always includes overdue ones, sorted first', () => {
    const { events } = CalendarEventBuilder.build({
      positions: [
        pos({ symbol: 'FAR', maturityDate: '2027-12-31' }),
        pos({ symbol: 'LATE', maturityDate: '2026-07-01' }),
        pos({ symbol: 'SOON', maturityDate: '2026-08-01' }),
      ],
      dividendFacts: [], horizonDays: 90, today: TODAY,
    });
    expect(events.map((e) => e.symbol)).toEqual(['LATE', 'SOON']);
    expect(events[0].overdue).toBe(true);
    expect(events[0].daysUntil).toBeLessThan(0);
  });

  it('counts unparseable/missing maturity dates instead of throwing (FR edge case)', () => {
    const { events, fixedIncomeWithoutMaturity } = CalendarEventBuilder.build({
      positions: [
        pos({ symbol: 'NODATE', maturityDate: null }),
        pos({ symbol: 'BAD', maturityDate: 'soon-ish' }),
        pos({ symbol: 'OK' }),
      ],
      dividendFacts: [], horizonDays: 180, today: TODAY,
    });
    expect(fixedIncomeWithoutMaturity).toBe(2);
    expect(events.map((e) => e.symbol)).toEqual(['OK']);
  });

  it('ignores closed positions and non-fixed-income types for maturities', () => {
    const { events } = CalendarEventBuilder.build({
      positions: [
        pos({ symbol: 'CLOSED', status: 'closed' }),
        pos({ symbol: 'STK', assetType: 'stock' }),
      ],
      dividendFacts: [], horizonDays: 180, today: TODAY,
    });
    expect(events).toHaveLength(0);
  });

  it('emits dividend ex/payment events with quantity-scaled amounts for stocks/etfs', () => {
    const { events } = CalendarEventBuilder.build({
      positions: [pos({ symbol: 'DIV', assetType: 'etf', quantity: 10, currency: 'USD', maturityDate: null })],
      dividendFacts: [{ symbol: 'DIV', exDate: '2026-08-05', payDate: '2026-08-20', perShareEstimate: 0.5 }],
      horizonDays: 90, today: TODAY,
    });
    expect(events.map((e) => e.type)).toEqual(['dividend-ex', 'dividend-payment']);
    expect(events[0].amountUsd).toBe(5); // 0.5 × 10
    expect(events[0].currency).toBe('USD');
  });

  it('emits date-only events for cedears (ratio unknown — research D2) and never past-dated dividends', () => {
    const { events } = CalendarEventBuilder.build({
      positions: [pos({ symbol: 'CED', assetType: 'cedear', quantity: 100, maturityDate: null })],
      dividendFacts: [{ symbol: 'CED', exDate: '2026-06-01', payDate: '2026-08-20', perShareEstimate: 0.5 }],
      horizonDays: 90, today: TODAY,
    });
    expect(events).toHaveLength(1); // past ex-date dropped
    expect(events[0].type).toBe('dividend-payment');
    expect(events[0].amountNative).toBeNull();
    expect(events[0].amountUsd).toBeNull();
  });

  it('deposit maturities use quantity as the native amount', () => {
    const { events } = CalendarEventBuilder.build({
      positions: [pos({ symbol: 'PF', assetType: 'deposit', quantity: 5000, currentPrice: null, valueUsd: 5000 })],
      dividendFacts: [], horizonDays: 180, today: TODAY,
    });
    expect(events[0].amountNative).toBe(5000);
  });
});
