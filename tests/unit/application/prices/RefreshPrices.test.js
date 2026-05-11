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
      chainFor: jest.fn()
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
      chainFor: jest.fn().mockReturnValue([mockProvider])
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
    expect(mockPriceRepo.recordQuote).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'yahoo', success: true })
    );
  });

  it('should record failed quotes without updating positions when all providers fail', async () => {
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
      chainFor: jest.fn().mockReturnValue([mockProvider])
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
    expect(mockPositionRepo.update).not.toHaveBeenCalled();
    expect(mockPriceRepo.recordQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: 'Quote not found'
      })
    );
  });

  it('should fall through to the next provider when the first throws', async () => {
    const position = new Position({
      brokerId: 'broker1',
      assetType: 'bond',
      symbol: 'GD35',
      quantity: 100,
      averageCost: 100,
      currency: 'ARS'
    });

    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([position]),
      update: jest.fn().mockResolvedValue(undefined)
    };

    const mockPriceRepo = {
      recordQuote: jest.fn().mockResolvedValue(undefined)
    };

    const failingProvider = {
      name: 'iol',
      getQuote: jest.fn().mockRejectedValue(new Error('IOL down'))
    };
    const succeedingProvider = {
      name: 'cohen',
      getQuote: jest.fn().mockResolvedValue({
        price: 115710,
        currency: 'ARS',
        providerSymbol: 'GD35'
      })
    };

    const mockRouter = {
      chainFor: jest.fn().mockReturnValue([failingProvider, succeedingProvider])
    };

    const useCase = new RefreshPrices({
      positionRepository: mockPositionRepo,
      priceRepository: mockPriceRepo,
      priceProviderRouter: mockRouter
    });

    const result = await useCase.execute({});

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(failingProvider.getQuote).toHaveBeenCalledTimes(1);
    expect(succeedingProvider.getQuote).toHaveBeenCalledTimes(1);
    expect(mockPriceRepo.recordQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'cohen',
        price: 115710,
        success: true
      })
    );
  });

  it('should record failure with the last error when every provider in the chain fails', async () => {
    const position = new Position({
      brokerId: 'broker1',
      assetType: 'bond',
      symbol: 'GD35D',
      quantity: 100,
      averageCost: 80,
      currency: 'USD'
    });

    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([position]),
      update: jest.fn()
    };

    const mockPriceRepo = {
      recordQuote: jest.fn().mockResolvedValue(undefined)
    };

    const iol = { name: 'iol', getQuote: jest.fn().mockRejectedValue(new Error('iol failed')) };
    const yahoo = { name: 'yahoo', getQuote: jest.fn().mockRejectedValue(new Error('yahoo failed')) };

    const mockRouter = {
      chainFor: jest.fn().mockReturnValue([iol, yahoo])
    };

    const useCase = new RefreshPrices({
      positionRepository: mockPositionRepo,
      priceRepository: mockPriceRepo,
      priceProviderRouter: mockRouter
    });

    const result = await useCase.execute({});

    expect(result.failed).toBe(1);
    expect(mockPositionRepo.update).not.toHaveBeenCalled();
    expect(mockPriceRepo.recordQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: 'yahoo failed'
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
      chainFor: jest.fn().mockReturnValue([mockProvider])
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

  it('should refresh positions sharing a symbol but different assetType independently', async () => {
    // IBKR holds VIST as a US stock; BullMarket holds VIST as an Argentine CEDEAR.
    // They share a ticker but are distinct instruments and must be quoted separately.
    const ibkrVist = new Position({
      brokerId: 'ibkr',
      assetType: 'stock',
      symbol: 'VIST',
      quantity: 10,
      averageCost: 50,
      currency: 'USD',
      exchange: 'NYSE'
    });
    const bullmarketVist = new Position({
      brokerId: 'bullmarket',
      assetType: 'cedear',
      symbol: 'VIST',
      quantity: 100,
      averageCost: 5000,
      currency: 'ARS',
      exchange: 'BCBA'
    });

    const updates = [];
    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([ibkrVist, bullmarketVist]),
      update: jest.fn().mockImplementation(async (pos) => { updates.push(pos); })
    };

    const mockPriceRepo = {
      recordQuote: jest.fn().mockResolvedValue(undefined)
    };

    const provider = {
      name: 'yahoo',
      getQuote: jest.fn().mockImplementation(async ({ symbol, assetType }) => {
        if (assetType === 'stock') return { price: 80, currency: 'USD', providerSymbol: symbol };
        if (assetType === 'cedear') return { price: 7500, currency: 'ARS', providerSymbol: `${symbol}.BA` };
        throw new Error(`unexpected assetType ${assetType}`);
      })
    };

    const mockRouter = {
      chainFor: jest.fn().mockReturnValue([provider])
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
    expect(provider.getQuote).toHaveBeenCalledTimes(2);

    // Each position got its own price — no cross-contamination.
    const ibkrUpdate = updates.find(p => p.brokerId.value === 'ibkr');
    const bullUpdate = updates.find(p => p.brokerId.value === 'bullmarket');
    expect(ibkrUpdate.currentPrice).toBe(80);
    expect(bullUpdate.currentPrice).toBe(7500);
  });

  it('should include duration in result', async () => {
    const mockPositionRepo = {
      findOpenWithPriceQuotable: jest.fn().mockResolvedValue([])
    };

    const mockPriceRepo = {
      recordQuote: jest.fn()
    };

    const mockRouter = {
      chainFor: jest.fn()
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
