/**
 * PortfolioCalculator Service Tests
 */

const PortfolioCalculator = require('../../../../src/domain/services/PortfolioCalculator');
const Portfolio = require('../../../../src/domain/entities/Portfolio');
const Position = require('../../../../src/domain/entities/Position');
const { DomainError } = require('../../../../src/shared/errors');

describe('PortfolioCalculator Service', () => {
  const createPosition = (overrides = {}) => {
    return new Position({
      brokerId: 'galicia',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 100,
      averageCost: 100,
      currency: 'USD',
      currentPrice: 150,
      ...overrides
    });
  };

  describe('constructor', () => {
    it('should create calculator with portfolio and mepRate', () => {
      const portfolio = new Portfolio([]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      expect(calculator.portfolio instanceof Portfolio).toBe(true);
      expect(calculator.mepRate).toBe(1000);
    });

    it('should reject non-Portfolio', () => {
      expect(() => new PortfolioCalculator({}, 1000)).toThrow(DomainError);
      expect(() => new PortfolioCalculator(null, 1000)).toThrow(DomainError);
    });

    it('should reject invalid mepRate', () => {
      const portfolio = new Portfolio([]);

      expect(() => new PortfolioCalculator(portfolio, 0)).toThrow(DomainError);
      expect(() => new PortfolioCalculator(portfolio, -1)).toThrow(DomainError);
      expect(() => new PortfolioCalculator(portfolio, NaN)).toThrow(DomainError);
      expect(() => new PortfolioCalculator(portfolio, 'not a number')).toThrow(DomainError);
    });
  });

  describe('grandTotalUsd', () => {
    it('should calculate total in USD', () => {
      const pos = createPosition({ currency: 'USD', currentPrice: 150, quantity: 100 });
      const portfolio = new Portfolio([pos]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      expect(calculator.grandTotalUsd()).toBe(15000);
    });

    it('should convert ARS to USD using MEP rate', () => {
      const pos = createPosition({ currency: 'ARS', currentPrice: 1000, quantity: 100 });
      const portfolio = new Portfolio([pos]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      // 100 shares * 1000 ARS = 100000 ARS / 1000 MEP rate = 100 USD
      expect(calculator.grandTotalUsd()).toBe(100);
    });

    it('should sum multiple currencies', () => {
      const usdPos = createPosition({ currency: 'USD', currentPrice: 150, quantity: 100 });
      const arsPos = createPosition({ symbol: 'GGBR', currency: 'ARS', currentPrice: 1000, quantity: 100 });
      const portfolio = new Portfolio([usdPos, arsPos]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      // USD: 15000
      // ARS: 100000 / 1000 = 100
      // Total: 15100
      expect(calculator.grandTotalUsd()).toBe(15100);
    });

    it('should return 0 for empty portfolio', () => {
      const portfolio = new Portfolio([]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      expect(calculator.grandTotalUsd()).toBe(0);
    });
  });

  describe('summary', () => {
    it('should return complete summary object', () => {
      const pos = createPosition({ currency: 'USD', currentPrice: 150, quantity: 100 });
      const portfolio = new Portfolio([pos]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      const summary = calculator.summary();

      expect(summary).toHaveProperty('grandTotalUsd');
      expect(summary).toHaveProperty('totalByCurrency');
      expect(summary).toHaveProperty('costBasisByCurrency');
      expect(summary).toHaveProperty('unrealizedPnlByCurrency');
      expect(summary).toHaveProperty('totalByBroker');
      expect(summary).toHaveProperty('totalByAssetType');
      expect(summary).toHaveProperty('topPerformers');
      expect(summary).toHaveProperty('bottomPerformers');
    });

    it('should include correct values in summary', () => {
      const pos = createPosition({
        currency: 'USD',
        currentPrice: 150,
        quantity: 100,
        averageCost: 100
      });
      const portfolio = new Portfolio([pos]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      const summary = calculator.summary();

      expect(summary.grandTotalUsd).toBe(15000);
      expect(summary.totalByCurrency.USD).toBe(15000);
      expect(summary.costBasisByCurrency.USD).toBe(10000);
      expect(summary.unrealizedPnlByCurrency.USD).toBe(5000);
    });

    it('should include top and bottom performers', () => {
      const pos1 = createPosition({ symbol: 'A', averageCost: 100, currentPrice: 150 });
      const pos2 = createPosition({ symbol: 'B', averageCost: 100, currentPrice: 80 });
      const portfolio = new Portfolio([pos1, pos2]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      const summary = calculator.summary();

      expect(Array.isArray(summary.topPerformers)).toBe(true);
      expect(Array.isArray(summary.bottomPerformers)).toBe(true);
      expect(summary.topPerformers[0].symbol.value).toBe('A');
      expect(summary.bottomPerformers[0].symbol.value).toBe('B');
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const portfolio = new Portfolio([]);
      const calculator = new PortfolioCalculator(portfolio, 1000);

      calculator.mepRate = 2000; // Try to modify
      expect(calculator.mepRate).toBe(1000); // Should still be original
    });
  });
});
