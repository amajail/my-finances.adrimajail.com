// Factory functions for creating test data and mocks

class MockFactory {
  static createPortfolioPosition(overrides = {}) {
    return {
      id: 'pos_1',
      symbol: 'GGAL',
      quantity: 100,
      avgCost: 150.00,
      currentPrice: 155.00,
      marketValue: 15500.00,
      currency: 'ARS',
      broker: 'IOL',
      lastUpdated: new Date().toISOString(),
      ...overrides
    };
  }

  static createPortfolioSummary(overrides = {}) {
    return {
      totalValue: 50000.00,
      totalCost: 48000.00,
      totalGain: 2000.00,
      gainPercent: 4.17,
      currency: 'ARS',
      asOfDate: new Date().toISOString(),
      ...overrides
    };
  }

  static createPriceData(overrides = {}) {
    return {
      symbol: 'GGAL',
      price: 155.00,
      currency: 'ARS',
      timestamp: Date.now(),
      source: 'yahoo-finance',
      ...overrides
    };
  }

  static createDatabaseRecord(overrides = {}) {
    return {
      id: 'rec_1',
      partitionKey: 'portfolio',
      rowKey: 'position_1',
      timestamp: new Date().toISOString(),
      ...overrides
    };
  }
}

module.exports = MockFactory;
