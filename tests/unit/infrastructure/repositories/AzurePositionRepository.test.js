/**
 * AzurePositionRepository Unit Tests
 */

const AzurePositionRepository = require('../../../../src/infrastructure/repositories/AzurePositionRepository');
const Position = require('../../../../src/domain/entities/Position');
const BrokerId = require('../../../../src/domain/value-objects/BrokerId');
const { createMockTableClient } = require('../../../helpers/mock-table-client');
const { InfrastructureError } = require('../../../../src/shared/errors');

describe('AzurePositionRepository', () => {
  let mockDb;
  let repository;

  beforeEach(() => {
    mockDb = {
      brokersClient: createMockTableClient(),
      positionsClient: createMockTableClient(),
      settingsClient: createMockTableClient(),
      pricesClient: createMockTableClient()
    };
    repository = new AzurePositionRepository(mockDb);
  });

  describe('save', () => {
    it('should save a new position', async () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });

      const result = await repository.save(position);

      expect(result).toEqual(position);
      expect(mockDb.positionsClient.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'broker1',
          rowKey: 'stock__AAPL',
          brokerId: 'broker1',
          assetType: 'stock',
          symbol: 'AAPL'
        })
      );
    });

    it('should throw InfrastructureError on duplicate', async () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });

      await repository.save(position);

      const error = new Error('Conflict');
      error.statusCode = 409;
      mockDb.positionsClient.createEntity.mockRejectedValueOnce(error);

      await expect(repository.save(position)).rejects.toThrow(InfrastructureError);
    });
  });

  describe('findById', () => {
    it('should find a position by broker ID and row key (string)', async () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });
      await repository.save(position);

      const found = await repository.findById('broker1', 'stock__AAPL');

      expect(found).not.toBeNull();
      expect(found.brokerId.value).toBe('broker1');
      expect(found.assetType).toBe('stock');
      expect(found.symbol.value).toBe('AAPL');
    });

    it('should find a position by broker ID and row key (BrokerId instance)', async () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });
      await repository.save(position);

      const brokerId = BrokerId.of('broker1');
      const found = await repository.findById(brokerId, 'stock__AAPL');

      expect(found).not.toBeNull();
      expect(found.brokerId.value).toBe('broker1');
    });

    it('should return null when position not found', async () => {
      const found = await repository.findById('broker1', 'stock__NOTFOUND');
      expect(found).toBeNull();
    });
  });

  describe('findByBroker', () => {
    it('should find all positions for a broker', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });
      const pos2 = new Position({
        brokerId: 'broker1',
        assetType: 'etf',
        symbol: 'VOO',
        quantity: 5,
        averageCost: 400.0,
        currency: 'USD'
      });
      const pos3 = new Position({
        brokerId: 'broker2',
        assetType: 'stock',
        symbol: 'MSFT',
        quantity: 3,
        averageCost: 350.0,
        currency: 'USD'
      });

      await repository.save(pos1);
      await repository.save(pos2);
      await repository.save(pos3);

      const broker1Positions = await repository.findByBroker('broker1');

      expect(broker1Positions).toHaveLength(2);
      expect(broker1Positions.map(p => p.symbol.value)).toEqual(expect.arrayContaining(['AAPL', 'VOO']));
    });

    it('should find positions for a broker using BrokerId instance', async () => {
      const pos = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });
      await repository.save(pos);

      const brokerId = BrokerId.of('broker1');
      const positions = await repository.findByBroker(brokerId);

      expect(positions).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('should find all positions without filters', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        status: 'open'
      });
      const pos2 = new Position({
        brokerId: 'broker2',
        assetType: 'etf',
        symbol: 'VOO',
        quantity: 5,
        averageCost: 400.0,
        currency: 'USD',
        status: 'closed'
      });

      await repository.save(pos1);
      await repository.save(pos2);

      const all = await repository.findAll();

      expect(all).toHaveLength(2);
    });

    it('should filter positions by status=open', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        status: 'open'
      });
      const pos2 = new Position({
        brokerId: 'broker1',
        assetType: 'etf',
        symbol: 'VOO',
        quantity: 5,
        averageCost: 400.0,
        currency: 'USD',
        status: 'closed'
      });

      await repository.save(pos1);
      await repository.save(pos2);

      const open = await repository.findAll({ status: 'open' });

      expect(open).toHaveLength(1);
      expect(open[0].symbol.value).toBe('AAPL');
    });

    it('should filter positions by status=closed', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        status: 'open'
      });
      const pos2 = new Position({
        brokerId: 'broker1',
        assetType: 'etf',
        symbol: 'VOO',
        quantity: 5,
        averageCost: 400.0,
        currency: 'USD',
        status: 'closed'
      });

      await repository.save(pos1);
      await repository.save(pos2);

      const closed = await repository.findAll({ status: 'closed' });

      expect(closed).toHaveLength(1);
      expect(closed[0].symbol.value).toBe('VOO');
    });

    it('should filter positions by assetType', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });
      const pos2 = new Position({
        brokerId: 'broker1',
        assetType: 'etf',
        symbol: 'VOO',
        quantity: 5,
        averageCost: 400.0,
        currency: 'USD'
      });

      await repository.save(pos1);
      await repository.save(pos2);

      const stocks = await repository.findAll({ assetType: 'stock' });

      expect(stocks).toHaveLength(1);
      expect(stocks[0].assetType).toBe('stock');
    });

    it('should combine status and assetType filters', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        status: 'open'
      });
      const pos2 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'MSFT',
        quantity: 5,
        averageCost: 350.0,
        currency: 'USD',
        status: 'closed'
      });
      const pos3 = new Position({
        brokerId: 'broker1',
        assetType: 'etf',
        symbol: 'VOO',
        quantity: 5,
        averageCost: 400.0,
        currency: 'USD',
        status: 'open'
      });

      await repository.save(pos1);
      await repository.save(pos2);
      await repository.save(pos3);

      const result = await repository.findAll({ status: 'open', assetType: 'stock' });

      expect(result).toHaveLength(1);
      expect(result[0].symbol.value).toBe('AAPL');
    });
  });

  describe('update', () => {
    it('should update an existing position', async () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        currentPrice: 160.0
      });
      await repository.save(position);

      const updated = position.withCurrentPrice(170.0);
      const result = await repository.update(updated);

      expect(result.currentPrice).toBe(170.0);
    });
  });

  describe('delete', () => {
    it('should delete a position', async () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD'
      });
      await repository.save(position);

      const result = await repository.delete('broker1', 'stock__AAPL');

      expect(result).toBe(true);
    });

    it('should return false when position not found', async () => {
      mockDb.positionsClient.deleteEntity.mockRejectedValueOnce(
        Object.assign(new Error('Not found'), { statusCode: 404 })
      );

      const result = await repository.delete('broker1', 'stock__NOTFOUND');

      expect(result).toBe(false);
    });
  });

  describe('findOpenWithPriceQuotable', () => {
    it('should find open positions requiring price quotes', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        status: 'open'
      });
      const pos2 = new Position({
        brokerId: 'broker1',
        assetType: 'cash',
        symbol: 'USD',
        quantity: 1000,
        averageCost: 1.0,
        currency: 'USD',
        status: 'open'
      });
      const pos3 = new Position({
        brokerId: 'broker1',
        assetType: 'etf',
        symbol: 'VOO',
        quantity: 5,
        averageCost: 400.0,
        currency: 'USD',
        status: 'closed'
      });

      await repository.save(pos1);
      await repository.save(pos2);
      await repository.save(pos3);

      const result = await repository.findOpenWithPriceQuotable();

      expect(result).toHaveLength(1);
      expect(result[0].assetType).toBe('stock');
    });

    it('should include ETFs, bonds, and other price-quotable assets', async () => {
      const types = ['stock', 'etf', 'cedear', 'bond', 'bopreal', 'lecap', 'on'];
      const positions = [];

      for (const type of types) {
        const pos = new Position({
          brokerId: 'broker1',
          assetType: type,
          symbol: `${type.toUpperCase()}1`,
          quantity: 10,
          averageCost: 100.0,
          currency: 'USD',
          status: 'open'
        });
        positions.push(pos);
        await repository.save(pos);
      }

      const result = await repository.findOpenWithPriceQuotable();

      expect(result).toHaveLength(7);
    });

    it('should exclude closed positions', async () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        status: 'closed'
      });

      await repository.save(pos1);

      const result = await repository.findOpenWithPriceQuotable();

      expect(result).toHaveLength(0);
    });
  });

  describe('mapper round-trip', () => {
    it('should correctly map Position to database and back', async () => {
      const original = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        displayName: 'Apple Inc.',
        quantity: 10.5,
        averageCost: 150.25,
        currency: 'USD',
        currentPrice: 170.0,
        currentPriceUpdatedAt: new Date('2024-01-02'),
        exchange: 'NASDAQ',
        status: 'open',
        realizedPnl: 0,
        notes: 'Long position',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02')
      });

      await repository.save(original);
      const found = await repository.findById('broker1', original.id());

      expect(found.symbol.value).toBe('AAPL');
      expect(found.displayName).toBe('Apple Inc.');
      expect(found.quantity.value).toBe(10.5);
      expect(found.averageCost).toBe(150.25);
      expect(found.currentPrice).toBe(170.0);
      expect(found.exchange).toBe('NASDAQ');
      expect(found.status).toBe('open');
    });

    it('should handle null optional fields', async () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10,
        averageCost: 150.0,
        currency: 'USD',
        currentPrice: null,
        currentPriceUpdatedAt: null,
        exchange: null,
        maturityDate: null,
        displayName: null,
        notes: null
      });

      await repository.save(position);
      const found = await repository.findById('broker1', position.id());

      expect(found.currentPrice).toBeNull();
      expect(found.currentPriceUpdatedAt).toBeNull();
      expect(found.exchange).toBeNull();
      expect(found.maturityDate).toBeNull();
      expect(found.displayName).toBeNull();
      expect(found.notes).toBeNull();
    });
  });
});
