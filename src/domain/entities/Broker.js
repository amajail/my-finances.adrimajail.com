/**
 * Broker Entity
 *
 * Represents a broker or cash holder in the portfolio.
 * Encapsulates broker information and metadata.
 */

const BrokerId = require('../value-objects/BrokerId');
const { ValidationError } = require('../../shared/errors');

/**
 * @typedef {Object} BrokerData
 * @property {string} id - Broker ID (slug)
 * @property {string} displayName - Display name for the broker
 * @property {string} type - Type of broker ('broker' | 'cash_holder')
 * @property {string} [accentColor] - Accent color for UI
 * @property {string} [notes] - Notes about the broker
 * @property {Date|string} [createdAt] - Creation timestamp
 * @property {Date|string} [updatedAt] - Update timestamp
 */

class Broker {
  /**
   * Create a Broker instance
   * @param {BrokerData} data - Broker data
   * @throws {ValidationError} If broker data is invalid
   */
  constructor(data) {
    // Validate and create value objects
    this._id = BrokerId.of(data.id);
    this._displayName = data.displayName;
    this._type = data.type;
    this._accentColor = data.accentColor || null;
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
   * Validate broker data
   * @private
   * @throws {ValidationError} If validation fails
   */
  _validate() {
    const errors = [];

    // Validate displayName
    if (!this._displayName || typeof this._displayName !== 'string' || this._displayName.trim().length === 0) {
      errors.push('Display name is required and must be a non-empty string');
    }

    // Validate type
    if (!['broker', 'cash_holder'].includes(this._type)) {
      errors.push("Type must be 'broker' or 'cash_holder'");
    }

    if (errors.length > 0) {
      throw ValidationError.forField('broker', errors.join(', '));
    }
  }

  /**
   * Get the broker ID value object
   * @returns {BrokerId}
   */
  get id() {
    return this._id;
  }

  /**
   * Get the broker ID as string (convenience)
   * @returns {string}
   */
  get idValue() {
    return this._id.value;
  }

  /**
   * Get the display name
   * @returns {string}
   */
  get displayName() {
    return this._displayName;
  }

  /**
   * Get the type
   * @returns {string}
   */
  get type() {
    return this._type;
  }

  /**
   * Get the accent color
   * @returns {string|null}
   */
  get accentColor() {
    return this._accentColor;
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
   * Check if this is a cash holder
   * @returns {boolean}
   */
  isCashHolder() {
    return this._type === 'cash_holder';
  }

  /**
   * Check if this is a broker
   * @returns {boolean}
   */
  isBroker() {
    return this._type === 'broker';
  }

  /**
   * Convert to plain object (for persistence)
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this._id.value,
      displayName: this._displayName,
      type: this._type,
      accentColor: this._accentColor,
      notes: this._notes,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }

  /**
   * Create Broker from plain object
   * @param {Object} data - Plain object data
   * @returns {Broker}
   */
  static fromJSON(data) {
    return new Broker(data);
  }

  /**
   * Check if two brokers are equal
   * @param {Broker} other - Broker to compare
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof Broker)) {
      return false;
    }
    return this._id.equals(other._id);
  }
}

module.exports = Broker;
