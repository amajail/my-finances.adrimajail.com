/**
 * GetPortfolioSummary Use Case Tests
 */

const GetPortfolioSummary = require('../../../../src/application/use-cases/portfolio/GetPortfolioSummary');
const Broker = require('../../../../src/domain/entities/Broker');
const Position = require('../../../../src/domain/entities/Position');

describe('GetPortfolioSummary Use Case', () => {
  it('should generate portfolio summary', async () => {
    const broker = new Broker({
      id: 'broker1',
      displayName: 'Galicia',
      type: 'broker'
    });

    const position = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD',
      currentPrice: 160
    });

    const mockBrokerRepo = {
      findAll: jest.fn().mockResolvedValue([broker])
    };

    const mockPositionRepo = {
      findAll: jest.fn().mockResolvedValue([position])
    };

    const mockSettingsRepo = {
      get: jest.fn().mockResolvedValue({ value: '1000' })
    };

    const mockPriceRepo = {
      getRecent: jest.fn().mockResolvedValue([])
    };

    const useCase = new GetPortfolioSummary({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo,
      settingsRepository: mockSettingsRepo,
      priceRepository: mockPriceRepo
    });

    const result = await useCase.execute({});

    expect(result).toHaveProperty('grandTotalUsd');
    expect(result).toHaveProperty('totalByCurrency');
    expect(result).toHaveProperty('mepRate');
    expect(result.mepRate).toBe(1000);
  });

  it('should use default MEP rate when setting fails', async () => {
    const broker = new Broker({
      id: 'broker2',
      displayName: 'IOL',
      type: 'broker'
    });

    const position = new Position({
      brokerId: 'broker2',
      assetType: 'stock',
      symbol: 'MSFT',
      quantity: 5,
      averageCost: 300,
      currency: 'USD',
      currentPrice: 320
    });

    const mockBrokerRepo = {
      findAll: jest.fn().mockResolvedValue([broker])
    };

    const mockPositionRepo = {
      findAll: jest.fn().mockResolvedValue([position])
    };

    const mockSettingsRepo = {
      get: jest.fn().mockRejectedValue(new Error('Not found'))
    };

    const mockPriceRepo = {
      getRecent: jest.fn().mockResolvedValue([])
    };

    const useCase = new GetPortfolioSummary({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo,
      settingsRepository: mockSettingsRepo,
      priceRepository: mockPriceRepo
    });

    const result = await useCase.execute({});

    expect(result.mepRate).toBe(1);
  });

  it('should include lastPriceRefreshAt when available', async () => {
    const broker = new Broker({
      id: 'broker1',
      displayName: 'Galicia',
      type: 'broker'
    });

    const mockBrokerRepo = {
      findAll: jest.fn().mockResolvedValue([broker])
    };

    const mockPositionRepo = {
      findAll: jest.fn().mockResolvedValue([])
    };

    const mockSettingsRepo = {
      get: jest.fn().mockResolvedValue(null)
    };

    const now = new Date();
    const mockPriceRepo = {
      getRecent: jest.fn().mockResolvedValue([{
        success: true,
        fetchedAt: now
      }])
    };

    const useCase = new GetPortfolioSummary({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo,
      settingsRepository: mockSettingsRepo,
      priceRepository: mockPriceRepo
    });

    const result = await useCase.execute({});

    expect(result.lastPriceRefreshAt).toEqual(now);
  });

  it('should set lastPriceRefreshAt to null when no quotes exist', async () => {
    const broker = new Broker({
      id: 'broker2',
      displayName: 'IOL',
      type: 'broker'
    });

    const mockBrokerRepo = {
      findAll: jest.fn().mockResolvedValue([broker])
    };

    const mockPositionRepo = {
      findAll: jest.fn().mockResolvedValue([])
    };

    const mockSettingsRepo = {
      get: jest.fn().mockResolvedValue(null)
    };

    const mockPriceRepo = {
      getRecent: jest.fn().mockResolvedValue([])
    };

    const useCase = new GetPortfolioSummary({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo,
      settingsRepository: mockSettingsRepo,
      priceRepository: mockPriceRepo
    });

    const result = await useCase.execute({});

    expect(result.lastPriceRefreshAt).toBeNull();
  });
});
