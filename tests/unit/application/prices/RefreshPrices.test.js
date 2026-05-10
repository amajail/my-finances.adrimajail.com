/**
 * RefreshPrices Use Case Tests
 */

const RefreshPrices = require('../../../../src/application/use-cases/prices/RefreshPrices');
const Position = require('../../../../src/domain/entities/Position');

describe('RefreshPrices Use Case', () => {
  it('should return 0 symbols when no positions exist', async () => {
    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([])
    };

    const mockPriceRepo = {
      recordQuote: jest.fn()
    };

    const mockRouter = {
      pickFor: jest.fn()
    };

    const useCase = new RefreshPrices({
      positionRepository: mockPositionRepo,
      priceRepository: mockPriceRepo,
      priceProviderRouter: mockRouter
    });

    const result = await useCase.execute({});

    expect(result.totalSymbols).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should fetch and update prices for all unique symbols', async () => {
    const position1 = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD',
      exchange: 'NYSE'
    });

    const position2 = new Position({
      brokerId: 'broker2',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 5,
      averageCost: 145,
      currency: 'USD',
      exchange: 'NYSE'
    });

    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([position1, position2]),
      update: jest.fn().mockResolvedValue(undefined)
    };

    const mockPriceRepo = {
      recordQuote: jest.fn().mockResolvedValue(undefined)
    };

    const mockProvider = {
      name: 'yahoo',
      getQuote: jest.fn().mockResolvedValue({
        price: 160,
        currency: 'USD',
        providerSymbol: 'AAPL'
      })
    };

    const mockRouter = {
      pickFor: jest.fn().mockReturnValue(mockProvider)
    };

    const useCase = new RefreshPrices({
      positionRepository: mockPositionRepo,
      priceRepository: mockPriceRepo,
      priceProviderRouter: mockRouter
    });

    const result = await useCase.execute({});

    expect(result.totalSymbols).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    // Should update both positions with the same symbol
    expect(mockPositionRepo.update).toHaveBeenCalledTimes(2);
    expect(mockPriceRepo.recordQuote).toHaveBeenCalledTimes(1);
  });

  it('should record failed quotes without updating positions', async () => {
    const position = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'BADSTOCK',
      quantity: 10,
      averageCost: 100,
      currency: 'USD'
    });

    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([position]),
      update: jest.fn()
    };

    const mockPriceRepo = {
      recordQuote: jest.fn().mockResolvedValue(undefined)
    };

    const mockProvider = {
      name: 'yahoo',
      getQuote: jest.fn().mockRejectedValue(new Error('Quote not found'))
    };

    const mockRouter = {
      pickFor: jest.fn().mockReturnValue(mockProvider)
    };

    const useCase = new RefreshPrices({
      positionRepository: mockPositionRepo,
      priceRepository: mockPriceRepo,
      priceProviderRouter: mockRouter
    });

    const result = await useCase.execute({});

    expect(result.totalSymbols).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    // Should NOT update positions on failure
    expect(mockPositionRepo.update).not.toHaveBeenCalled();
    // Should record failed quote
    expect(mockPriceRepo.recordQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: 'Quote not found'
      })
    );
  });

  it('should process multiple symbols sequentially', async () => {
    const position1 = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD'
    });

    const position2 = new Position({
      brokerId: 'broker2',
      assetType: 'stock',
      symbol: 'MSFT',
      quantity: 5,
      averageCost: 300,
      currency: 'USD'
    });

    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([position1, position2]),
      update: jest.fn().mockResolvedValue(undefined)
    };

    const mockPriceRepo = {
      recordQuote: jest.fn().mockResolvedValue(undefined)
    };

    const mockProvider = {
      name: 'yahoo',
      getQuote: jest.fn().mockImplementation(async ({ symbol }) => ({
        price: symbol === 'AAPL' ? 160 : 320,
        currency: 'USD',
        providerSymbol: symbol
      }))
    };

    const mockRouter = {
      pickFor: jest.fn().mockReturnValue(mockProvider)
    };

    const useCase = new RefreshPrices({
      positionRepository: mockPositionRepo,
      priceRepository: mockPriceRepo,
      priceProviderRouter: mockRouter
    });

    const result = await useCase.execute({});

    expect(result.totalSymbols).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockPriceRepo.recordQuote).toHaveBeenCalledTimes(2);
    expect(mockPositionRepo.update).toHaveBeenCalledTimes(2);
  });

  it('should include duration in result', async () => {
    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([])
    };

    const mockPriceRepo = {
      recordQuote: jest.fn()
    };

    const mockRouter = {
      pickFor: jest.fn()
    };

    const useCase = new RefreshPrices({
      positionRepository: mockPositionRepo,
      priceRepository: mockPriceRepo,
      priceProviderRouter: mockRouter
    });

    const result = await useCase.execute({});

    expect(result).toHaveProperty('durationMs');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
