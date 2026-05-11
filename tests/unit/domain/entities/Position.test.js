/**
 * Position Entity Tests
 */

const Position = require('../../../../src/domain/entities/Position');
const { ValidationError } = require('../../../../src/shared/errors');

describe('Position Entity', () => {
  describe('constructor', () => {
    it('should create a valid position', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150.50,
        currency: 'USD',
        currentPrice: 175.25,
        displayName: 'Apple Inc.'
      });

      expect(position.brokerId.value).toBe('broker1');
      expect(position.assetType).toBe('stock');
      expect(position.symbol.value).toBe('AAPL');
      expect(position.quantity.value).toBe(100);
      expect(position.averageCost).toBe(150.50);
      expect(position.currency).toBe('USD');
      expect(position.currentPrice).toBe(175.25);
      expect(position.status).toBe('open');
    });

    it('should handle null currentPrice', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: null
      });

      expect(position.currentPrice).toBeNull();
    });

    it('should reject invalid assetType', () => {
      expect(() => new Position({
        brokerId: 'broker1',
        assetType: 'invalid',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      })).toThrow(ValidationError);
    });

    it('should reject negative averageCost', () => {
      expect(() => new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: -10,
        currency: 'USD'
      })).toThrow(ValidationError);
    });

    it('should reject invalid status', () => {
      expect(() => new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        status: 'invalid'
      })).toThrow(ValidationError);
    });
  });

  describe('id', () => {
    it('should return position identifier in assetType__symbol format', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      expect(position.id()).toBe('stock__AAPL');
    });
  });

  describe('isOpen / isClosed', () => {
    it('should report open status correctly', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        status: 'open'
      });

      expect(position.isOpen()).toBe(true);
      expect(position.isClosed()).toBe(false);
    });

    it('should report closed status correctly', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 0,
        averageCost: 150,
        currency: 'USD',
        status: 'closed'
      });

      expect(position.isOpen()).toBe(false);
      expect(position.isClosed()).toBe(true);
    });
  });

  describe('costBasis', () => {
    it('should calculate cost basis', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      expect(position.costBasis()).toBe(15000);
    });

    it('should handle decimal quantities', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 10.5,
        averageCost: 100,
        currency: 'USD'
      });

      expect(position.costBasis()).toBe(1050);
    });

    it('should divide by 100 for bonds (per-100-nominales convention)', () => {
      // 100 nominales at PPC 150 (per 100) → 100 * 1.50 = 150
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'bond',
        symbol: 'BNDA',
        quantity: 100,
        averageCost: 150,
        currency: 'ARS'
      });

      expect(position.costBasis()).toBe(150);
    });

    it('should apply per-100 convention for bopreal, lecap, and on as well', () => {
      const make = (assetType) => new Position({
        brokerId: 'broker1',
        assetType,
        symbol: 'X',
        quantity: 1000,
        averageCost: 100,
        currency: 'ARS'
      });

      expect(make('bopreal').costBasis()).toBe(1000);
      expect(make('lecap').costBasis()).toBe(1000);
      expect(make('on').costBasis()).toBe(1000);
    });
  });

  describe('marketValue', () => {
    it('should calculate market value with price', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: 175
      });

      expect(position.marketValue()).toBe(17500);
    });

    it('should return null if currentPrice is not set', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: null
      });

      expect(position.marketValue()).toBeNull();
    });

    it('should divide by 100 for bonds (per-100-nominales convention)', () => {
      // 100 nominales at price 150 (per 100) → 100 * 1.50 = 150
      const bond = new Position({
        brokerId: 'broker1',
        assetType: 'bond',
        symbol: 'BNDA',
        quantity: 100,
        averageCost: 140,
        currency: 'ARS',
        currentPrice: 150
      });
      expect(bond.marketValue()).toBe(150);

      // 1_000_000 nominales at price 100 (per 100, par) → 1_000_000 * 1.00 = 1_000_000
      const lecap = new Position({
        brokerId: 'broker1',
        assetType: 'lecap',
        symbol: 'LCAP',
        quantity: 1000000,
        averageCost: 100,
        currency: 'ARS',
        currentPrice: 100
      });
      expect(lecap.marketValue()).toBe(1000000);
    });
  });

  describe('unrealizedPnl', () => {
    it('should calculate unrealized PnL', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: 175
      });

      expect(position.unrealizedPnl()).toBe(2500);
    });

    it('should return null if currentPrice is not set', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      expect(position.unrealizedPnl()).toBeNull();
    });

    it('should handle negative PnL', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 175,
        currency: 'USD',
        currentPrice: 150
      });

      expect(position.unrealizedPnl()).toBe(-2500);
    });

    it('should compute PnL on per-100-nominales basis for bonds', () => {
      // 100 nominales, PPC 140 (per 100), current 150 (per 100)
      // → (100 * 150/100) - (100 * 140/100) = 150 - 140 = 10
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'bond',
        symbol: 'BNDA',
        quantity: 100,
        averageCost: 140,
        currency: 'ARS',
        currentPrice: 150
      });

      expect(position.unrealizedPnl()).toBe(10);
    });
  });

  describe('unrealizedPnlPercent', () => {
    it('should calculate unrealized PnL percent', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: 165
      });

      const pnlPercent = position.unrealizedPnlPercent();
      expect(pnlPercent).toBeCloseTo(10);
    });

    it('should return null if currentPrice is not set', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      expect(position.unrealizedPnlPercent()).toBeNull();
    });

    it('should return null if costBasis is zero', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 0,
        currency: 'USD',
        currentPrice: 100
      });

      expect(position.unrealizedPnlPercent()).toBeNull();
    });

    it('should handle negative PnL percent', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 200,
        currency: 'USD',
        currentPrice: 150
      });

      const pnlPercent = position.unrealizedPnlPercent();
      expect(pnlPercent).toBeCloseTo(-25);
    });
  });

  describe('withCurrentPrice', () => {
    it('should create new position with updated price', () => {
      const original = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: 160
      });

      const updated = original.withCurrentPrice(175);

      expect(updated.currentPrice).toBe(175);
      expect(original.currentPrice).toBe(160);
      expect(updated instanceof Position).toBe(true);
    });

    it('should update timestamp', () => {
      const original = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      const originalUpdatedAt = original.updatedAt;
      const updated = original.withCurrentPrice(160);

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it('should preserve other fields', () => {
      const original = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        displayName: 'Apple Inc.',
        exchange: 'NASDAQ'
      });

      const updated = original.withCurrentPrice(175);

      expect(updated.displayName).toBe('Apple Inc.');
      expect(updated.exchange).toBe('NASDAQ');
      expect(updated.brokerId.equals(original.brokerId)).toBe(true);
    });
  });

  describe('close', () => {
    it('should create closed position', () => {
      const open = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: 160
      });

      const closed = open.close(1000);

      expect(closed.status).toBe('closed');
      expect(closed.realizedPnl).toBe(1000);
      expect(open.status).toBe('open');
    });

    it('should update timestamp', () => {
      const original = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      const originalUpdatedAt = original.updatedAt;
      const closed = original.close(500);

      expect(closed.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });
  });

  describe('toJSON', () => {
    it('should return plain object', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: 175
      });

      const json = position.toJSON();

      expect(json.brokerId).toBe('broker1');
      expect(json.assetType).toBe('stock');
      expect(json.symbol).toBe('AAPL');
      expect(json.quantity).toBe(100);
      expect(json.averageCost).toBe(150);
      expect(json.currentPrice).toBe(175);
    });
  });

  describe('fromJSON', () => {
    it('should round-trip with toJSON', () => {
      const original = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD',
        currentPrice: 175
      });

      const json = original.toJSON();
      const restored = Position.fromJSON(json);

      expect(restored.equals(original)).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for positions with same broker/asset/symbol', () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      const pos2 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 200,
        averageCost: 200,
        currency: 'USD'
      });

      expect(pos1.equals(pos2)).toBe(true);
    });

    it('should return false for different positions', () => {
      const pos1 = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      const pos2 = new Position({
        brokerId: 'broker2',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      expect(pos1.equals(pos2)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const position = new Position({
        brokerId: 'broker1',
        assetType: 'stock',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: 150,
        currency: 'USD'
      });

      position.status = 'closed'; // Try to modify
      expect(position.status).toBe('open'); // Should still be original
    });
  });
});
