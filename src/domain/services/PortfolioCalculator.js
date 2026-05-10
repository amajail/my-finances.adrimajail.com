/**
 * Portfolio Calculator Service
 *
 * Domain service that wraps a Portfolio and MEP rate to provide
 * dashboard-friendly summary methods.
 */

const Portfolio = require('../entities/Portfolio');
const { DomainError } = require('../../shared/errors');

class PortfolioCalculator {
  /**
   * Create a PortfolioCalculator instance
   * @param {Portfolio} portfolio - Portfolio to analyze
   * @param {number} mepRate - MEP rate for ARS to USD conversion
   * @throws {DomainError} If inputs are invalid
   */
  constructor(portfolio, mepRate) {
    // Validate portfolio
    if (!(portfolio instanceof Portfolio)) {
      throw new DomainError('Portfolio must be a Portfolio instance');
    }

    // Validate mepRate
    if (typeof mepRate !== 'number' || isNaN(mepRate) || mepRate <= 0) {
      throw new DomainError('MEP rate must be a positive number');
    }

    Object.defineProperty(this, '_portfolio', {
      value: portfolio,
      writable: false,
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(this, '_mepRate', {
      value: mepRate,
      writable: false,
      enumerable: false,
      configurable: false
    });

    // Freeze the object to ensure immutability
    Object.freeze(this);
  }

  /**
   * Get the portfolio
   * @returns {Portfolio}
   */
  get portfolio() {
    return this._portfolio;
  }

  /**
   * Get the MEP rate
   * @returns {number}
   */
  get mepRate() {
    return this._mepRate;
  }

  /**
   * Calculate grand total in USD
   * Converts all currencies to USD using MEP rate
   * @returns {number}
   */
  grandTotalUsd() {
    const totalsByCurrency = this._portfolio.totalByCurrency();
    let totalUsd = 0;

    for (const [currency, amount] of Object.entries(totalsByCurrency)) {
      if (currency === 'USD') {
        totalUsd += amount;
      } else if (currency === 'ARS') {
        totalUsd += amount / this._mepRate;
      } else {
        // For other currencies, assume 1:1 with USD (or could apply different rates)
        totalUsd += amount;
      }
    }

    return totalUsd;
  }

  /**
   * Generate comprehensive portfolio summary
   * @returns {Object} Summary object with all metrics
   */
  summary() {
    return {
      grandTotalUsd: this.grandTotalUsd(),
      totalByCurrency: this._portfolio.totalByCurrency(),
      costBasisByCurrency: this._portfolio.costBasisByCurrency(),
      unrealizedPnlByCurrency: this._portfolio.unrealizedPnlByCurrency(),
      totalByBroker: this._portfolio.totalByBroker(this._mepRate),
      totalByAssetType: this._portfolio.totalByAssetType(),
      topPerformers: this._portfolio.topPerformers(),
      bottomPerformers: this._portfolio.bottomPerformers()
    };
  }
}

module.exports = PortfolioCalculator;
