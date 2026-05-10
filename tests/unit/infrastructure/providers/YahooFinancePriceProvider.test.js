/**
 * YahooFinancePriceProvider Tests
 */

const YahooFinancePriceProvider = require('../../../../src/infrastructure/providers/YahooFinancePriceProvider');
const { ValidationError, InfrastructureError } = require('../../../../src/shared/errors');

describe('YahooFinancePriceProvider', () => {
  describe('name property', () => {
    it('should return "yahoo"', () => {
      const provider = new YahooFinancePriceProvider();
      expect(provider.name).toBe('yahoo');
    });
  });

  describe('getQuote', () => {
    it('should throw ValidationError when symbol is missing', async () => {
      const provider = new YahooFinancePriceProvider();
      await expect(provider.getQuote({ assetType: 'stock' }))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw InfrastructureError when no mapping for asset type', async () => {
      const mockClient = {
        quote: jest.fn()
      };
      const provider = new YahooFinancePriceProvider(mockClient);
      await expect(provider.getQuote({ symbol: 'CASH', assetType: 'cash' }))
        .rejects
        .toThrow(InfrastructureError);
    });

    it('should fetch price successfully for US stock', async () => {
      const mockClient = {
        quote: jest.fn().mockResolvedValue({
          regularMarketPrice: 150.25,
          currency: 'USD'
        })
      };
      const provider = new YahooFinancePriceProvider(mockClient);

      const result = await provider.getQuote({
        symbol: 'AAPL',
        assetType: 'stock',
        currency: 'USD'
      });

      expect(result.price).toBe(150.25);
      expect(result.currency).toBe('USD');
      expect(result.providerSymbol).toBe('AAPL');
      expect(mockClient.quote).toHaveBeenCalledWith('AAPL');
    });

    it('should fetch price for Argentine stock', async () => {
      const mockClient = {
        quote: jest.fn().mockResolvedValue({
          regularMarketPrice: 850.50,
          currency: 'ARS'
        })
      };
      const provider = new YahooFinancePriceProvider(mockClient);

      const result = await provider.getQuote({
        symbol: 'GGAL',
        assetType: 'stock',
        exchange: 'BCBA',
        currency: 'ARS'
      });

      expect(result.price).toBe(850.50);
      expect(result.currency).toBe('ARS');
      expect(result.providerSymbol).toBe('GGAL.BA');
      expect(mockClient.quote).toHaveBeenCalledWith('GGAL.BA');
    });

    it('should use default currency USD when not provided by client', async () => {
      const mockClient = {
        quote: jest.fn().mockResolvedValue({
          regularMarketPrice: 100,
          currency: undefined
        })
      };
      const provider = new YahooFinancePriceProvider(mockClient);

      const result = await provider.getQuote({
        symbol: 'TEST',
        assetType: 'stock',
        currency: 'USD'
      });

      expect(result.currency).toBe('USD');
    });

    it('should throw InfrastructureError when Yahoo API fails', async () => {
      const mockClient = {
        quote: jest.fn().mockRejectedValue(new Error('Network error'))
      };
      const provider = new YahooFinancePriceProvider(mockClient);

      await expect(provider.getQuote({
        symbol: 'AAPL',
        assetType: 'stock',
        currency: 'USD'
      }))
        .rejects
        .toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when price is missing', async () => {
      const mockClient = {
        quote: jest.fn().mockResolvedValue({
          regularMarketPrice: undefined,
          currency: 'USD'
        })
      };
      const provider = new YahooFinancePriceProvider(mockClient);

      await expect(provider.getQuote({
        symbol: 'AAPL',
        assetType: 'stock',
        currency: 'USD'
      }))
        .rejects
        .toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when response is null', async () => {
      const mockClient = {
        quote: jest.fn().mockResolvedValue(null)
      };
      const provider = new YahooFinancePriceProvider(mockClient);

      await expect(provider.getQuote({
        symbol: 'AAPL',
        assetType: 'stock',
        currency: 'USD'
      }))
        .rejects
        .toThrow(InfrastructureError);
    });
  });
});
