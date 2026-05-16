/**
 * GetPortfolioSummary Use Case Tests
 *
 * Updated for the MEP-provider migration: the use-case no longer reads the
 * legacy `mep_rate` portfolioSettings row. It depends on an injected
 * IMepProvider instead.
 */

const GetPortfolioSummary = require('../../../../src/application/use-cases/portfolio/GetPortfolioSummary');
const Broker = require('../../../../src/domain/entities/Broker');
const Position = require('../../../../src/domain/entities/Position');

function mockMepProvider(reading) {
  return { getLatest: jest.fn().mockResolvedValue(reading) };
}
function failingMepProvider() {
  return { getLatest: jest.fn().mockRejectedValue(new Error('upstream timeout')) };
}

describe('GetPortfolioSummary Use Case', () => {
  it('should generate portfolio summary using the MEP provider rate', async () => {
    const broker = new Broker({ id: 'broker1', displayName: 'Galicia', type: 'broker' });
    const position = new Position({
      brokerId: 'broker1', assetType: 'stock', symbol: 'AAPL',
      quantity: 10, averageCost: 150, currency: 'USD', currentPrice: 160,
    });

    const useCase = new GetPortfolioSummary({
      brokerRepository: { findAll: jest.fn().mockResolvedValue([broker]) },
      positionRepository: { findAll: jest.fn().mockResolvedValue([position]) },
      priceRepository: { getRecent: jest.fn().mockResolvedValue([]) },
      mepProvider: mockMepProvider({ rate: 1000, asOf: '2026-05-14' }),
    });

    const result = await useCase.execute({});

    expect(result).toHaveProperty('grandTotalUsd');
    expect(result).toHaveProperty('totalByCurrency');
    expect(result).toHaveProperty('mepRate');
    expect(result.mepRate).toBe(1000);
    expect(result.mepRateAsOf).toBe('2026-05-14');
  });

  it('should fall back to mepRate=1 when the MEP provider fails', async () => {
    const broker = new Broker({ id: 'broker2', displayName: 'IOL', type: 'broker' });
    const position = new Position({
      brokerId: 'broker2', assetType: 'stock', symbol: 'MSFT',
      quantity: 5, averageCost: 300, currency: 'USD', currentPrice: 320,
    });

    const useCase = new GetPortfolioSummary({
      brokerRepository: { findAll: jest.fn().mockResolvedValue([broker]) },
      positionRepository: { findAll: jest.fn().mockResolvedValue([position]) },
      priceRepository: { getRecent: jest.fn().mockResolvedValue([]) },
      mepProvider: failingMepProvider(),
    });

    const result = await useCase.execute({});

    expect(result.mepRate).toBe(1);
    expect(result.mepRateAsOf).toBeNull();
  });

  it('should fall back to mepRate=1 when no MEP provider is injected at all', async () => {
    const broker = new Broker({ id: 'broker1', displayName: 'Galicia', type: 'broker' });

    const useCase = new GetPortfolioSummary({
      brokerRepository: { findAll: jest.fn().mockResolvedValue([broker]) },
      positionRepository: { findAll: jest.fn().mockResolvedValue([]) },
      priceRepository: { getRecent: jest.fn().mockResolvedValue([]) },
      // mepProvider intentionally omitted
    });

    const result = await useCase.execute({});

    expect(result.mepRate).toBe(1);
    expect(result.mepRateAsOf).toBeNull();
  });

  it('should include lastPriceRefreshAt when a successful quote exists', async () => {
    const broker = new Broker({ id: 'broker1', displayName: 'Galicia', type: 'broker' });
    const now = new Date();

    const useCase = new GetPortfolioSummary({
      brokerRepository: { findAll: jest.fn().mockResolvedValue([broker]) },
      positionRepository: { findAll: jest.fn().mockResolvedValue([]) },
      priceRepository: { getRecent: jest.fn().mockResolvedValue([{ success: true, fetchedAt: now }]) },
      mepProvider: mockMepProvider({ rate: 1400, asOf: '2026-05-14' }),
    });

    const result = await useCase.execute({});

    expect(result.lastPriceRefreshAt).toEqual(now);
  });

  it('should set lastPriceRefreshAt to null when no quotes exist', async () => {
    const broker = new Broker({ id: 'broker2', displayName: 'IOL', type: 'broker' });

    const useCase = new GetPortfolioSummary({
      brokerRepository: { findAll: jest.fn().mockResolvedValue([broker]) },
      positionRepository: { findAll: jest.fn().mockResolvedValue([]) },
      priceRepository: { getRecent: jest.fn().mockResolvedValue([]) },
      mepProvider: mockMepProvider({ rate: 1400, asOf: '2026-05-14' }),
    });

    const result = await useCase.execute({});

    expect(result.lastPriceRefreshAt).toBeNull();
  });
});
