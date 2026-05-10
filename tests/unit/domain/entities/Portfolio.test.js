/**
 * Portfolio Entity Tests
 */

const Portfolio = require('../../../../src/domain/entities/Portfolio');
const Position = require('../../../../src/domain/entities/Position');
const Broker = require('../../../../src/domain/entities/Broker');
const { ValidationError, DomainError } = require('../../../../src/shared/errors');

describe('Portfolio Entity', () => {
  const createPosition = (overrides = {}) => {
    return new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 100,
      averageCost: 100,
      currency: 'USD',
      currentPrice: 150,
      ...overrides
    });
  };

  const createBroker = (overrides = {}) => {
    return new Broker({
      id: 'broker1',
      displayName: 'Galicia',
      type: 'broker',
      ...overrides
    });
  };

  describe('constructor', () => {
    it('should create portfolio with positions and brokers', () => {
      const pos = createPosition();
      const broker = createBroker();
      const portfolio = new Portfolio([pos], [broker]);

      expect(portfolio.positions.length).toBe(1);
      expect(portfolio.brokers.length).toBe(1);
    });

    it('should accept empty positions and brokers', () => {
      const portfolio = new Portfolio([], []);
      expect(portfolio.positions.length).toBe(0);
      expect(portfolio.brokers.length).toBe(0);
    });

    it('should reject non-array positions', () => {
      expect(() => new Portfolio('not an array')).toThrow(ValidationError);
    });

    it('should reject non-Position elements', () => {
      expect(() => new Portfolio([{ invalid: 'position' }])).toThrow(ValidationError);
    });

    it('should reject non-array brokers', () => {
      expect(() => new Portfolio([], 'not an array')).toThrow(ValidationError);
    });

    it('should reject non-Broker elements', () => {
      const pos = createPosition();
      expect(() => new Portfolio([pos], [{ invalid: 'broker' }])).toThrow(ValidationError);
    });
  });

  describe('positions / brokers getters', () => {
    it('should return copies of arrays', () => {
      const pos = createPosition();
      const broker = createBroker();
      const portfolio = new Portfolio([pos], [broker]);

      const positions = portfolio.positions;
      const brokers = portfolio.brokers;

      expect(positions).toEqual([pos]);
      expect(brokers).toEqual([broker]);
      expect(positions).not.toBe(portfolio.positions);
      expect(brokers).not.toBe(portfolio.brokers);
    });
  });

  describe('openPositions / closedPositions', () => {
    it('should filter by status', () => {
      const open = createPosition({ status: 'open' });
      const closed = createPosition({ symbol: 'GOOGL', status: 'closed' });
      const portfolio = new Portfolio([open, closed]);

      expect(portfolio.openPositions()).toEqual([open]);
      expect(portfolio.closedPositions()).toEqual([closed]);
    });
  });

  describe('positionsByBroker', () => {
    it('should filter positions by broker ID', () => {
      const pos1 = createPosition({ brokerId: 'broker1' });
      const pos2 = createPosition({ brokerId: 'broker2', symbol: 'GOOGL' });
      const portfolio = new Portfolio([pos1, pos2]);

      expect(portfolio.positionsByBroker('broker1')).toEqual([pos1]);
      expect(portfolio.positionsByBroker('broker2')).toEqual([pos2]);
    });
  });

  describe('totalByCurrency', () => {
    it('should sum market values by currency', () => {
      const pos1 = createPosition({ currency: 'USD', currentPrice: 150, quantity: 100 });
      const pos2 = createPosition({ symbol: 'GOOGL', currency: 'USD', currentPrice: 200, quantity: 50 });
      const portfolio = new Portfolio([pos1, pos2]);

      const totals = portfolio.totalByCurrency();

      expect(totals.USD).toBe(15000 + 10000); // (100 * 150) + (50 * 200)
    });

    it('should handle multiple currencies', () => {
      const pos1 = createPosition({ currency: 'USD', currentPrice: 150, quantity: 100 });
      const pos2 = createPosition({ symbol: 'GGBR', currency: 'ARS', currentPrice: 1000, quantity: 50 });
      const portfolio = new Portfolio([pos1, pos2]);

      const totals = portfolio.totalByCurrency();

      expect(totals.USD).toBe(15000);
      expect(totals.ARS).toBe(50000);
    });

    it('should exclude closed positions', () => {
      const open = createPosition({ currency: 'USD', currentPrice: 150, quantity: 100, status: 'open' });
      const closed = createPosition({ symbol: 'GOOGL', currency: 'USD', currentPrice: 200, quantity: 50, status: 'closed' });
      const portfolio = new Portfolio([open, closed]);

      const totals = portfolio.totalByCurrency();

      expect(totals.USD).toBe(15000);
    });

    it('should treat null currentPrice as 0', () => {
      const pos = createPosition({ currentPrice: null, quantity: 100 });
      const portfolio = new Portfolio([pos]);

      const totals = portfolio.totalByCurrency();

      expect(totals.USD).toBe(0);
    });
  });

  describe('costBasisByCurrency', () => {
    it('should sum cost basis by currency', () => {
      const pos1 = createPosition({ currency: 'USD', averageCost: 100, quantity: 100 });
      const pos2 = createPosition({ symbol: 'GOOGL', currency: 'USD', averageCost: 200, quantity: 50 });
      const portfolio = new Portfolio([pos1, pos2]);

      const totals = portfolio.costBasisByCurrency();

      expect(totals.USD).toBe(10000 + 10000);
    });

    it('should exclude closed positions', () => {
      const open = createPosition({ currency: 'USD', averageCost: 100, quantity: 100, status: 'open' });
      const closed = createPosition({ symbol: 'GOOGL', currency: 'USD', averageCost: 200, quantity: 50, status: 'closed' });
      const portfolio = new Portfolio([open, closed]);

      const totals = portfolio.costBasisByCurrency();

      expect(totals.USD).toBe(10000);
    });
  });

  describe('unrealizedPnlByCurrency', () => {
    it('should sum unrealized PnL by currency', () => {
      const pos1 = createPosition({ currency: 'USD', averageCost: 100, currentPrice: 150, quantity: 100 });
      const pos2 = createPosition({ symbol: 'GOOGL', currency: 'USD', averageCost: 100, currentPrice: 120, quantity: 50 });
      const portfolio = new Portfolio([pos1, pos2]);

      const totals = portfolio.unrealizedPnlByCurrency();

      expect(totals.USD).toBe(5000 + 1000); // (150-100)*100 + (120-100)*50
    });

    it('should treat null unrealizedPnl as 0', () => {
      const pos = createPosition({ currentPrice: null });
      const portfolio = new Portfolio([pos]);

      const totals = portfolio.unrealizedPnlByCurrency();

      expect(totals.USD).toBe(0);
    });
  });

  describe('totalByBroker', () => {
    it('should calculate totals by broker with MEP rate', () => {
      const pos1 = createPosition({ brokerId: 'broker1', currency: 'USD', currentPrice: 150, quantity: 100 });
      const pos2 = createPosition({ brokerId: 'broker2', symbol: 'GGBR', currency: 'ARS', currentPrice: 1000, quantity: 50 });
      const portfolio = new Portfolio([pos1, pos2]);

      const totals = portfolio.totalByBroker(1000);

      expect(totals.broker1.native.USD).toBe(15000);
      expect(totals.broker1.usdEquivalent).toBe(15000);
      expect(totals.broker2.native.ARS).toBe(50000);
      expect(totals.broker2.usdEquivalent).toBe(50);
    });

    it('should throw error for invalid mepRate', () => {
      const pos = createPosition();
      const portfolio = new Portfolio([pos]);

      expect(() => portfolio.totalByBroker(0)).toThrow(DomainError);
      expect(() => portfolio.totalByBroker(-1)).toThrow(DomainError);
      expect(() => portfolio.totalByBroker(NaN)).toThrow(DomainError);
    });

    it('should exclude closed positions', () => {
      const open = createPosition({ brokerId: 'broker1', currentPrice: 150, quantity: 100, status: 'open' });
      const closed = createPosition({ symbol: 'GOOGL', brokerId: 'broker1', currentPrice: 200, quantity: 50, status: 'closed' });
      const portfolio = new Portfolio([open, closed]);

      const totals = portfolio.totalByBroker(1000);

      expect(totals.broker1.native.USD).toBe(15000);
    });
  });

  describe('totalByAssetType', () => {
    it('should sum by asset type and currency', () => {
      const stock = createPosition({ assetType: 'stock', currency: 'USD', currentPrice: 150, quantity: 100 });
      const etf = createPosition({ symbol: 'SPY', assetType: 'etf', currency: 'USD', currentPrice: 400, quantity: 50 });
      const portfolio = new Portfolio([stock, etf]);

      const totals = portfolio.totalByAssetType();

      expect(totals.stock.USD).toBe(15000);
      expect(totals.etf.USD).toBe(20000);
    });

    it('should exclude closed positions', () => {
      const open = createPosition({ assetType: 'stock', currentPrice: 150, quantity: 100, status: 'open' });
      const closed = createPosition({ symbol: 'SPY', assetType: 'etf', currentPrice: 400, quantity: 50, status: 'closed' });
      const portfolio = new Portfolio([open, closed]);

      const totals = portfolio.totalByAssetType();

      expect(totals.stock.USD).toBe(15000);
      expect(totals.etf).toBeUndefined();
    });
  });

  describe('topPerformers', () => {
    it('should return top n performers by PnL percent', () => {
      const pos1 = createPosition({ symbol: 'A', averageCost: 100, currentPrice: 150, quantity: 100 }); // +50%
      const pos2 = createPosition({ symbol: 'B', averageCost: 100, currentPrice: 120, quantity: 100 }); // +20%
      const pos3 = createPosition({ symbol: 'C', averageCost: 100, currentPrice: 110, quantity: 100 }); // +10%
      const portfolio = new Portfolio([pos1, pos2, pos3]);

      const top = portfolio.topPerformers(2);

      expect(top.length).toBe(2);
      expect(top[0].symbol.value).toBe('A');
      expect(top[1].symbol.value).toBe('B');
    });

    it('should default to top 5', () => {
      const positions = Array.from({ length: 10 }, (_, i) =>
        createPosition({ symbol: String.fromCharCode(65 + i), currentPrice: 150 })
      );
      const portfolio = new Portfolio(positions);

      const top = portfolio.topPerformers();

      expect(top.length).toBe(5);
    });

    it('should exclude positions without currentPrice', () => {
      const withPrice = createPosition({ symbol: 'A', currentPrice: 150 });
      const withoutPrice = createPosition({ symbol: 'B', currentPrice: null });
      const portfolio = new Portfolio([withPrice, withoutPrice]);

      const top = portfolio.topPerformers(10);

      expect(top.length).toBe(1);
      expect(top[0].symbol.value).toBe('A');
    });

    it('should exclude closed positions', () => {
      const open = createPosition({ symbol: 'A', currentPrice: 150, status: 'open' });
      const closed = createPosition({ symbol: 'B', currentPrice: 200, status: 'closed' });
      const portfolio = new Portfolio([open, closed]);

      const top = portfolio.topPerformers(10);

      expect(top.length).toBe(1);
    });
  });

  describe('bottomPerformers', () => {
    it('should return bottom n performers by PnL percent', () => {
      const pos1 = createPosition({ symbol: 'A', averageCost: 150, currentPrice: 100, quantity: 100 }); // -33%
      const pos2 = createPosition({ symbol: 'B', averageCost: 120, currentPrice: 100, quantity: 100 }); // -17%
      const pos3 = createPosition({ symbol: 'C', averageCost: 110, currentPrice: 100, quantity: 100 }); // -9%
      const portfolio = new Portfolio([pos1, pos2, pos3]);

      const bottom = portfolio.bottomPerformers(2);

      expect(bottom.length).toBe(2);
      expect(bottom[0].symbol.value).toBe('A');
      expect(bottom[1].symbol.value).toBe('B');
    });

    it('should default to bottom 5', () => {
      const positions = Array.from({ length: 10 }, (_, i) =>
        createPosition({ symbol: String.fromCharCode(65 + i), averageCost: 200, currentPrice: 100 })
      );
      const portfolio = new Portfolio(positions);

      const bottom = portfolio.bottomPerformers();

      expect(bottom.length).toBe(5);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('should round-trip with fromJSON', () => {
      const pos = createPosition();
      const broker = createBroker();
      const original = new Portfolio([pos], [broker]);

      const json = original.toJSON();
      const restored = Portfolio.fromJSON(json);

      expect(restored.positions.length).toBe(1);
      expect(restored.brokers.length).toBe(1);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const portfolio = new Portfolio([], []);
      const originalPositions = portfolio.positions;
      portfolio.positions = ['modified']; // Try to modify
      expect(portfolio.positions).toEqual(originalPositions); // Should still be original
    });
  });
});
