/**
 * Portfolio Entity (Aggregate Root)
 *
 * Represents a complete portfolio composed of positions across brokers.
 * Encapsulates portfolio-level calculations and aggregations.
 */

const Position = require('./Position');
const Broker = require('./Broker');
const { DomainError, ValidationError } = require('../../shared/errors');

/**
 * Portfolio aggregate root
 */
class Portfolio {
  /**
   * Create a Portfolio instance
   * @param {Position[]} positions - Array of Position entities
   * @param {Broker[]} [brokers=[]] - Array of Broker entities
   * @throws {ValidationError} If positions or brokers are invalid
   */
  constructor(positions, brokers = []) {
    // Validate positions
    if (!Array.isArray(positions)) {
      throw ValidationError.forField('positions', 'Positions must be an array');
    }

    for (const pos of positions) {
      if (!(pos instanceof Position)) {
        throw ValidationError.forField('positions', 'All positions must be Position instances');
      }
    }

    // Validate brokers
    if (!Array.isArray(brokers)) {
      throw ValidationError.forField('brokers', 'Brokers must be an array');
    }

    for (const broker of brokers) {
      if (!(broker instanceof Broker)) {
        throw ValidationError.forField('brokers', 'All brokers must be Broker instances');
      }
    }

    // Store as copies to maintain immutability
    Object.defineProperty(this, '_positions', {
      value: Object.freeze([...positions]),
      writable: false,
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(this, '_brokers', {
      value: Object.freeze([...brokers]),
      writable: false,
      enumerable: false,
      configurable: false
    });

    // Freeze the object to ensure immutability
    Object.freeze(this);
  }

  /**
   * Get a copy of positions array
   * @returns {Position[]}
   */
  get positions() {
    return [...this._positions];
  }

  /**
   * Get a copy of brokers array
   * @returns {Broker[]}
   */
  get brokers() {
    return [...this._brokers];
  }

  /**
   * Get open positions
   * @returns {Position[]}
   */
  openPositions() {
    return this._positions.filter(pos => pos.isOpen());
  }

  /**
   * Get closed positions
   * @returns {Position[]}
   */
  closedPositions() {
    return this._positions.filter(pos => pos.isClosed());
  }

  /**
   * Get positions for a specific broker
   * @param {string} brokerId - Broker ID
   * @returns {Position[]}
   */
  positionsByBroker(brokerId) {
    return this._positions.filter(pos => pos.brokerId.value === brokerId);
  }

  /**
   * Calculate total market value by currency
   * Only includes OPEN positions. Treats null marketValue as 0.
   * @returns {Object} { ARS: number, USD: number, ... }
   */
  totalByCurrency() {
    const totals = {};

    for (const pos of this.openPositions()) {
      const currency = pos.currency;
      const marketValue = pos.marketValue() || 0;

      if (!totals[currency]) {
        totals[currency] = 0;
      }
      totals[currency] += marketValue;
    }

    return totals;
  }

  /**
   * Calculate total cost basis by currency
   * Only includes OPEN positions.
   * @returns {Object} { ARS: number, USD: number, ... }
   */
  costBasisByCurrency() {
    const totals = {};

    for (const pos of this.openPositions()) {
      const currency = pos.currency;
      const costBasis = pos.costBasis();

      if (!totals[currency]) {
        totals[currency] = 0;
      }
      totals[currency] += costBasis;
    }

    return totals;
  }

  /**
   * Calculate unrealized PnL by currency
   * Only includes OPEN positions. Treats null unrealizedPnl as 0.
   * @returns {Object} { ARS: number, USD: number, ... }
   */
  unrealizedPnlByCurrency() {
    const totals = {};

    for (const pos of this.openPositions()) {
      const currency = pos.currency;
      const unrealizedPnl = pos.unrealizedPnl() || 0;

      if (!totals[currency]) {
        totals[currency] = 0;
      }
      totals[currency] += unrealizedPnl;
    }

    return totals;
  }

  /**
   * Calculate total by broker and currency
   * Returns native values and USD-equivalent conversion
   * @param {number} mepRate - MEP rate for ARS to USD conversion
   * @returns {Object} { brokerId: { native: { ARS: x, USD: y }, usdEquivalent: number }, ... }
   * @throws {DomainError} If mepRate is invalid
   */
  totalByBroker(mepRate) {
    // Validate mepRate
    if (typeof mepRate !== 'number' || isNaN(mepRate) || mepRate <= 0) {
      throw new DomainError('MEP rate must be a positive number');
    }

    const totals = {};

    // Group by broker
    const brokerMap = {};
    for (const pos of this.openPositions()) {
      const brokerId = pos.brokerId.value;
      if (!brokerMap[brokerId]) {
        brokerMap[brokerId] = [];
      }
      brokerMap[brokerId].push(pos);
    }

    // Calculate totals per broker
    for (const [brokerId, brokerPositions] of Object.entries(brokerMap)) {
      const native = {};
      let usdEquivalent = 0;

      for (const pos of brokerPositions) {
        const marketValue = pos.marketValue() || 0;
        const currency = pos.currency;

        if (!native[currency]) {
          native[currency] = 0;
        }
        native[currency] += marketValue;

        // Convert to USD equivalent
        if (currency === 'USD') {
          usdEquivalent += marketValue;
        } else if (currency === 'ARS') {
          usdEquivalent += marketValue / mepRate;
        }
        // Note: Other currencies not converted in this simple implementation
      }

      totals[brokerId] = {
        native,
        usdEquivalent
      };
    }

    return totals;
  }

  /**
   * Calculate total by asset type
   * Returns aggregated values by asset type and currency
   * @returns {Object} { stock: { ARS: x, USD: y }, etf: { ARS: x, USD: y }, ... }
   */
  totalByAssetType() {
    const totals = {};

    for (const pos of this.openPositions()) {
      const assetType = pos.assetType;
      const currency = pos.currency;
      const marketValue = pos.marketValue() || 0;

      if (!totals[assetType]) {
        totals[assetType] = {};
      }
      if (!totals[assetType][currency]) {
        totals[assetType][currency] = 0;
      }

      totals[assetType][currency] += marketValue;
    }

    return totals;
  }

  /**
   * Get top performing positions
   * Sorted DESC by unrealizedPnlPercent, excluding positions with null pnl percent
   * @param {number} [n=5] - Number of top performers to return
   * @returns {Position[]}
   */
  topPerformers(n = 5) {
    return this.openPositions()
      .filter(pos => pos.unrealizedPnlPercent() !== null)
      .sort((a, b) => (b.unrealizedPnlPercent() || 0) - (a.unrealizedPnlPercent() || 0))
      .slice(0, n);
  }

  /**
   * Get bottom performing positions
   * Sorted ASC by unrealizedPnlPercent, excluding positions with null pnl percent
   * @param {number} [n=5] - Number of bottom performers to return
   * @returns {Position[]}
   */
  bottomPerformers(n = 5) {
    return this.openPositions()
      .filter(pos => pos.unrealizedPnlPercent() !== null)
      .sort((a, b) => (a.unrealizedPnlPercent() || 0) - (b.unrealizedPnlPercent() || 0))
      .slice(0, n);
  }

  /**
   * Convert to plain object (for persistence)
   * @returns {Object}
   */
  toJSON() {
    return {
      positions: this._positions.map(pos => pos.toJSON()),
      brokers: this._brokers.map(broker => broker.toJSON())
    };
  }

  /**
   * Create Portfolio from plain object
   * @param {Object} data - Plain object data with positions and brokers
   * @returns {Portfolio}
   */
  static fromJSON(data) {
    const positions = (data.positions || []).map(p => Position.fromJSON(p));
    const brokers = (data.brokers || []).map(b => Broker.fromJSON(b));
    return new Portfolio(positions, brokers);
  }
}

module.exports = Portfolio;
