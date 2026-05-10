/**
 * AzurePriceRepository Unit Tests
 */

const AzurePriceRepository = require('../../../../src/infrastructure/repositories/AzurePriceRepository');
const { createMockTableClient } = require('../../../helpers/mock-table-client');

describe('AzurePriceRepository', () => {
  let mockDb;
  let repository;

  beforeEach(() => {
    mockDb = {
      brokersClient: createMockTableClient(),
      positionsClient: createMockTableClient(),
      settingsClient: createMockTableClient(),
      pricesClient: createMockTableClient()
    };
    repository = new AzurePriceRepository(mockDb);
  });

  describe('recordQuote', () => {
    it('should record a successful quote', async () => {
      const quote = {
        symbol: 'AAPL',
        price: 150.25,
        currency: 'USD',
        provider: 'alpha-vantage',
        providerSymbol: 'AAPL',
        fetchedAt: new Date('2024-01-01T10:00:00Z'),
        success: true
      };

      await repository.recordQuote(quote);

      const entities = mockDb.pricesClient._getAllEntities();
      expect(entities).toHaveLength(1);
      expect(entities[0].partitionKey).toBe('AAPL');
      expect(entities[0].price).toBe(150.25);
      expect(entities[0].success).toBe(true);
    });

    it('should record a failed quote with error message', async () => {
      const quote = {
        symbol: 'INVALID',
        price: null,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date('2024-01-01T10:00:00Z'),
        success: false,
        errorMessage: 'Symbol not found'
      };

      await repository.recordQuote(quote);

      const entities = mockDb.pricesClient._getAllEntities();
      expect(entities).toHaveLength(1);
      expect(entities[0].success).toBe(false);
      expect(entities[0].errorMessage).toBe('Symbol not found');
    });

    it('should uppercase the symbol', async () => {
      const quote = {
        symbol: 'aapl',
        price: 150.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date(),
        success: true
      };

      await repository.recordQuote(quote);

      const entities = mockDb.pricesClient._getAllEntities();
      expect(entities[0].partitionKey).toBe('AAPL');
    });

    it('should throw error for empty symbol', async () => {
      const quote = {
        symbol: '',
        price: 150.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date(),
        success: true
      };

      await expect(repository.recordQuote(quote)).rejects.toThrow('Quote symbol is required');
    });

    it('should generate reverse-time row key', async () => {
      const date1 = new Date('2024-01-01T10:00:00Z');
      const date2 = new Date('2024-01-01T11:00:00Z');

      const quote1 = {
        symbol: 'AAPL',
        price: 150.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: date1,
        success: true
      };

      const quote2 = {
        symbol: 'AAPL',
        price: 151.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: date2,
        success: true
      };

      await repository.recordQuote(quote1);
      await repository.recordQuote(quote2);

      const entities = mockDb.pricesClient._getAllEntities();
      expect(entities).toHaveLength(2);

      // Later date should have smaller rowKey (reverse time)
      const laterDateEntity = entities.find(e => e.fetchedAt.startsWith('2024-01-01T11'));
      const earlierDateEntity = entities.find(e => e.fetchedAt.startsWith('2024-01-01T10'));

      expect(laterDateEntity.rowKey < earlierDateEntity.rowKey).toBe(true);
    });
  });

  describe('getLatestForSymbol', () => {
    it('should get the latest successful quote', async () => {
      const quote1 = {
        symbol: 'AAPL',
        price: 150.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date('2024-01-01T10:00:00Z'),
        success: true
      };

      const quote2 = {
        symbol: 'AAPL',
        price: 155.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date('2024-01-01T11:00:00Z'),
        success: true
      };

      await repository.recordQuote(quote1);
      await repository.recordQuote(quote2);

      const latest = await repository.getLatestForSymbol('AAPL');

      expect(latest).not.toBeNull();
      expect(latest.price).toBe(155.0);
      expect(latest.symbol).toBe('AAPL');
    });

    it('should skip failed quotes and return latest successful', async () => {
      const quote1 = {
        symbol: 'AAPL',
        price: 150.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date('2024-01-01T10:00:00Z'),
        success: true
      };

      const quote2 = {
        symbol: 'AAPL',
        price: null,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date('2024-01-01T11:00:00Z'),
        success: false,
        errorMessage: 'Rate limit exceeded'
      };

      await repository.recordQuote(quote1);
      await repository.recordQuote(quote2);

      const latest = await repository.getLatestForSymbol('AAPL');

      expect(latest).not.toBeNull();
      expect(latest.price).toBe(150.0);
      expect(latest.success).toBe(true);
    });

    it('should return null when no successful quotes found', async () => {
      const quote = {
        symbol: 'NOTFOUND',
        price: null,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date(),
        success: false,
        errorMessage: 'Not found'
      };

      await repository.recordQuote(quote);

      const latest = await repository.getLatestForSymbol('NOTFOUND');

      expect(latest).toBeNull();
    });

    it('should return null for non-existent symbol', async () => {
      const latest = await repository.getLatestForSymbol('NONEXISTENT');
      expect(latest).toBeNull();
    });

    it('should be case-insensitive', async () => {
      const quote = {
        symbol: 'aapl',
        price: 150.0,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date(),
        success: true
      };

      await repository.recordQuote(quote);

      const latest = await repository.getLatestForSymbol('AAPL');

      expect(latest).not.toBeNull();
      expect(latest.symbol).toBe('AAPL');
    });
  });

  describe('getRecent', () => {
    it('should get recent quotes sorted by fetchedAt descending', async () => {
      const quotes = [
        {
          symbol: 'AAPL',
          price: 150.0,
          currency: 'USD',
          provider: 'alpha-vantage',
          fetchedAt: new Date('2024-01-01T10:00:00Z'),
          success: true
        },
        {
          symbol: 'MSFT',
          price: 300.0,
          currency: 'USD',
          provider: 'alpha-vantage',
          fetchedAt: new Date('2024-01-01T11:00:00Z'),
          success: true
        },
        {
          symbol: 'GOOGL',
          price: 140.0,
          currency: 'USD',
          provider: 'alpha-vantage',
          fetchedAt: new Date('2024-01-01T09:00:00Z'),
          success: true
        }
      ];

      for (const quote of quotes) {
        await repository.recordQuote(quote);
      }

      const recent = await repository.getRecent();

      expect(recent).toHaveLength(3);
      expect(recent[0].symbol).toBe('MSFT');
      expect(recent[1].symbol).toBe('AAPL');
      expect(recent[2].symbol).toBe('GOOGL');
    });

    it('should include both successful and failed quotes', async () => {
      const quotes = [
        {
          symbol: 'AAPL',
          price: 150.0,
          currency: 'USD',
          provider: 'alpha-vantage',
          fetchedAt: new Date('2024-01-01T10:00:00Z'),
          success: true
        },
        {
          symbol: 'MSFT',
          price: null,
          currency: 'USD',
          provider: 'alpha-vantage',
          fetchedAt: new Date('2024-01-01T11:00:00Z'),
          success: false,
          errorMessage: 'Rate limit'
        }
      ];

      for (const quote of quotes) {
        await repository.recordQuote(quote);
      }

      const recent = await repository.getRecent();

      expect(recent).toHaveLength(2);
      expect(recent.some(q => q.success === true)).toBe(true);
      expect(recent.some(q => q.success === false)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        const quote = {
          symbol: `SYM${i}`,
          price: 100.0 + i,
          currency: 'USD',
          provider: 'alpha-vantage',
          fetchedAt: new Date(Date.now() - i * 1000),
          success: true
        };
        await repository.recordQuote(quote);
      }

      const recent = await repository.getRecent(5);

      expect(recent).toHaveLength(5);
    });

    it('should default to limit 100', async () => {
      for (let i = 0; i < 10; i++) {
        const quote = {
          symbol: `SYM${i}`,
          price: 100.0 + i,
          currency: 'USD',
          provider: 'alpha-vantage',
          fetchedAt: new Date(Date.now() - i * 1000),
          success: true
        };
        await repository.recordQuote(quote);
      }

      const recent = await repository.getRecent();

      expect(recent.length).toBe(10);
    });

    it('should return empty array when no quotes exist', async () => {
      const recent = await repository.getRecent();
      expect(recent).toEqual([]);
    });
  });

  describe('database entity structure', () => {
    it('should create entity with correct structure', async () => {
      const quote = {
        symbol: 'AAPL',
        price: 150.25,
        currency: 'USD',
        provider: 'alpha-vantage',
        providerSymbol: 'AAPL',
        fetchedAt: new Date('2024-01-01T10:00:00Z'),
        success: true
      };

      await repository.recordQuote(quote);

      const entities = mockDb.pricesClient._getAllEntities();
      const entity = entities[0];

      expect(entity.partitionKey).toBe('AAPL');
      expect(entity.rowKey).toBeDefined();
      expect(entity.price).toBe(150.25);
      expect(entity.currency).toBe('USD');
      expect(entity.provider).toBe('alpha-vantage');
      expect(entity.providerSymbol).toBe('AAPL');
      expect(entity.fetchedAt).toBe('2024-01-01T10:00:00.000Z');
      expect(entity.success).toBe(true);
    });

    it('should handle optional errorMessage', async () => {
      const quote = {
        symbol: 'AAPL',
        price: null,
        currency: 'USD',
        provider: 'alpha-vantage',
        fetchedAt: new Date(),
        success: false,
        errorMessage: 'Not found'
      };

      await repository.recordQuote(quote);

      const entities = mockDb.pricesClient._getAllEntities();
      expect(entities[0].errorMessage).toBe('Not found');
    });
  });
});
