/**
 * Position Entity
 *
 * Represents a single position in an asset held in a broker/cash holder.
 * Encapsulates investment position data and calculations.
 */

const BrokerId = require('../value-objects/BrokerId');
const Symbol = require('../value-objects/Symbol');
const Quantity = require('../value-objects/Quantity');
const AssetType = require('../value-objects/AssetType');
const { ValidationError } = require('../../shared/errors');

/**
 * @typedef {Object} PositionData
 * @property {string} brokerId - Broker ID (slug)
 * @property {string} assetType - Asset type (stock, etf, cedear, etc.)
 * @property {string} symbol - Asset symbol/ticker
 * @property {string} [displayName] - Display name for the position
 * @property {number} quantity - Quantity of shares/units
 * @property {number} averageCost - Average cost per unit
 * @property {string} currency - Currency (USD, ARS, etc.)
 * @property {number} [currentPrice] - Current price per unit
 * @property {Date|string} [currentPriceUpdatedAt] - Timestamp of last price update
 * @property {string} [exchange] - Exchange name
 * @property {string} [maturityDate] - Maturity date (ISO string, for bonds)
 * @property {string} [status] - Position status ('open' | 'closed', default 'open')
 * @property {number} [realizedPnl] - Realized profit/loss for closed positions
 * @property {string} [notes] - Notes about the position
 * @property {Date|string} [createdAt] - Creation timestamp
 * @property {Date|string} [updatedAt] - Update timestamp
 */

class Position {
  /**
   * Create a Position instance
   * @param {PositionData} data - Position data
   * @throws {ValidationError} If position data is invalid
   */
  constructor(data) {
    // Validate and create value objects
    this._brokerId = BrokerId.of(data.brokerId);
    this._assetType = data.assetType;
    this._symbol = Symbol.of(data.symbol);
    this._displayName = data.displayName || null;
    this._quantity = Quantity.of(data.quantity);
    this._averageCost = parseFloat(data.averageCost);
    this._currency = String(data.currency).toUpperCase();
    this._currentPrice = data.currentPrice !== null && data.currentPrice !== undefined ? parseFloat(data.currentPrice) : null;
    this._currentPriceUpdatedAt = data.currentPriceUpdatedAt ? new Date(data.currentPriceUpdatedAt) : null;
    this._exchange = data.exchange || null;
    this._maturityDate = data.maturityDate || null;
    this._status = data.status || 'open';
    this._realizedPnl = data.realizedPnl !== undefined ? parseFloat(data.realizedPnl) : 0;
    this._notes = data.notes || null;

    // Timestamps
    this._createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this._updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();

    // Validate
    this._validate();

    // Freeze the object to ensure immutability
    Object.freeze(this);
  }

  /**
   * Validate position data
   * @private
   * @throws {ValidationError} If validation fails
   */
  _validate() {
    const errors = [];

    // Validate assetType
    if (!AssetType.isValid(this._assetType)) {
      errors.push(`Invalid asset type: ${this._assetType}`);
    }

    // Validate averageCost
    if (typeof this._averageCost !== 'number' || isNaN(this._averageCost) || this._averageCost < 0) {
      errors.push('Average cost must be a non-negative number');
    }

    // Validate currency
    if (!this._currency || this._currency.length === 0) {
      errors.push('Currency is required');
    }

    // Validate status
    if (!['open', 'closed'].includes(this._status)) {
      errors.push("Status must be 'open' or 'closed'");
    }

    // Validate currentPrice if set
    if (this._currentPrice !== null && (typeof this._currentPrice !== 'number' || isNaN(this._currentPrice) || this._currentPrice < 0)) {
      errors.push('Current price must be a non-negative number');
    }

    if (errors.length > 0) {
      throw ValidationError.forField('position', errors.join(', '));
    }
  }

  /**
   * Get the broker ID value object
   * @returns {BrokerId}
   */
  get brokerId() {
    return this._brokerId;
  }

  /**
   * Get the asset type
   * @returns {string}
   */
  get assetType() {
    return this._assetType;
  }

  /**
   * Get the symbol value object
   * @returns {Symbol}
   */
  get symbol() {
    return this._symbol;
  }

  /**
   * Get the display name
   * @returns {string|null}
   */
  get displayName() {
    return this._displayName;
  }

  /**
   * Get the quantity value object
   * @returns {Quantity}
   */
  get quantity() {
    return this._quantity;
  }

  /**
   * Get the average cost
   * @returns {number}
   */
  get averageCost() {
    return this._averageCost;
  }

  /**
   * Get the currency
   * @returns {string}
   */
  get currency() {
    return this._currency;
  }

  /**
   * Get the current price
   * @returns {number|null}
   */
  get currentPrice() {
    return this._currentPrice;
  }

  /**
   * Get the current price update timestamp
   * @returns {Date|null}
   */
  get currentPriceUpdatedAt() {
    return this._currentPriceUpdatedAt;
  }

  /**
   * Get the exchange
   * @returns {string|null}
   */
  get exchange() {
    return this._exchange;
  }

  /**
   * Get the maturity date
   * @returns {string|null}
   */
  get maturityDate() {
    return this._maturityDate;
  }

  /**
   * Get the status
   * @returns {string}
   */
  get status() {
    return this._status;
  }

  /**
   * Get the realized PnL
   * @returns {number}
   */
  get realizedPnl() {
    return this._realizedPnl;
  }

  /**
   * Get the notes
   * @returns {string|null}
   */
  get notes() {
    return this._notes;
  }

  /**
   * Get creation timestamp
   * @returns {Date}
   */
  get createdAt() {
    return this._createdAt;
  }

  /**
   * Get update timestamp
   * @returns {Date}
   */
  get updatedAt() {
    return this._updatedAt;
  }

  /**
   * Get the position identifier
   * Format: assetType__symbol
   * @returns {string}
   */
  id() {
    return `${this._assetType}__${this._symbol.value}`;
  }

  /**
   * Check if this is an open position
   * @returns {boolean}
   */
  isOpen() {
    return this._status === 'open';
  }

  /**
   * Check if this is a closed position
   * @returns {boolean}
   */
  isClosed() {
    return this._status === 'closed';
  }

  /**
   * Calculate cost basis (quantity * averageCost)
   * @returns {number}
   */
  costBasis() {
    return this._quantity.value * this._averageCost;
  }

  /**
   * Calculate market value (quantity * currentPrice)
   * Returns null if currentPrice is not set
   * @returns {number|null}
   */
  marketValue() {
    if (this._currentPrice === null) {
      return null;
    }
    return this._quantity.value * this._currentPrice;
  }

  /**
   * Calculate unrealized PnL (marketValue - costBasis)
   * Returns null if marketValue cannot be calculated
   * @returns {number|null}
   */
  unrealizedPnl() {
    const mv = this.marketValue();
    if (mv === null) {
      return null;
    }
    return mv - this.costBasis();
  }

  /**
   * Calculate unrealized PnL percentage
   * Returns null if marketValue cannot be calculated or costBasis is zero
   * @returns {number|null}
   */
  unrealizedPnlPercent() {
    const costBasis = this.costBasis();
    const marketValue = this.marketValue();

    if (marketValue === null || costBasis <= 0) {
      return null;
    }

    return ((marketValue - costBasis) / costBasis) * 100;
  }

  /**
   * Create a new Position with updated current price
   * Returns a new instance (immutable)
   * @param {number} price - New current price
   * @param {Date} [asOf=new Date()] - Timestamp of the price update
   * @returns {Position} New Position instance
   */
  withCurrentPrice(price, asOf = new Date()) {
    return new Position({
      brokerId: this._brokerId.value,
      assetType: this._assetType,
      symbol: this._symbol.value,
      displayName: this._displayName,
      quantity: this._quantity.value,
      averageCost: this._averageCost,
      currency: this._currency,
      currentPrice: price,
      currentPriceUpdatedAt: asOf,
      exchange: this._exchange,
      maturityDate: this._maturityDate,
      status: this._status,
      realizedPnl: this._realizedPnl,
      notes: this._notes,
      createdAt: this._createdAt,
      updatedAt: new Date()
    });
  }

  /**
   * Create a new Position marking it as closed
   * Returns a new instance (immutable)
   * @param {number} realizedPnl - Realized profit/loss on close
   * @returns {Position} New closed Position instance
   */
  close(realizedPnl) {
    return new Position({
      brokerId: this._brokerId.value,
      assetType: this._assetType,
      symbol: this._symbol.value,
      displayName: this._displayName,
      quantity: this._quantity.value,
      averageCost: this._averageCost,
      currency: this._currency,
      currentPrice: this._currentPrice,
      currentPriceUpdatedAt: this._currentPriceUpdatedAt,
      exchange: this._exchange,
      maturityDate: this._maturityDate,
      status: 'closed',
      realizedPnl: realizedPnl,
      notes: this._notes,
      createdAt: this._createdAt,
      updatedAt: new Date()
    });
  }

  /**
   * Convert to plain object (for persistence)
   * @returns {Object}
   */
  toJSON() {
    return {
      brokerId: this._brokerId.value,
      assetType: this._assetType,
      symbol: this._symbol.value,
      displayName: this._displayName,
      quantity: this._quantity.value,
      averageCost: this._averageCost,
      currency: this._currency,
      currentPrice: this._currentPrice,
      currentPriceUpdatedAt: this._currentPriceUpdatedAt,
      exchange: this._exchange,
      maturityDate: this._maturityDate,
      status: this._status,
      realizedPnl: this._realizedPnl,
      notes: this._notes,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }

  /**
   * Create Position from plain object
   * @param {Object} data - Plain object data
   * @returns {Position}
   */
  static fromJSON(data) {
    return new Position(data);
  }

  /**
   * Check if two positions are equal
   * @param {Position} other - Position to compare
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof Position)) {
      return false;
    }
    return this._brokerId.equals(other._brokerId) &&
           this._assetType === other._assetType &&
           this._symbol.equals(other._symbol);
  }
}

module.exports = Position;
