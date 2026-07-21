/**
 * Domain Services
 *
 * Barrel export for all domain services
 */

const PortfolioCalculator = require('./PortfolioCalculator');
const QuantityChangeGuard = require('./QuantityChangeGuard');

module.exports = {
  PortfolioCalculator,
  QuantityChangeGuard
};
