/**
 * BrokerId Value Object
 *
 * Represents a broker identifier/slug.
 * Examples: broker1, broker2, cash
 * Immutable value object following DDD principles.
 */

const { ValidationError } = require('../../shared/errors');

class BrokerId {
  /**
   * Create a BrokerId instance
   * @param {string} value - Broker ID (slug)
   * @throws {ValidationError} If broker ID is invalid
   */
  constructor(value) {
    // Check for null/undefined early
    if (value === null || value === undefined) {
      throw ValidationError.forField('brokerId', 'Broker ID is required');
    }

    if (typeof value !== 'string') {
      throw ValidationError.forField('brokerId', 'Broker ID must be a string');
    }

    // Store normalized value (trim and lowercase)
    const normalizedValue = value.trim().toLowerCase();

    // Validate broker ID
    const validation = BrokerId._validate(normalizedValue);
    if (!validation.valid) {
      throw ValidationError.forField('brokerId', validation.errors.join(', '));
    }

    Object.defineProperty(this, '_value', {
      value: normalizedValue,
      writable: false,
      enumerable: false,
      configurable: false
    });

    // Freeze the object to ensure immutability
    Object.freeze(this);
  }

  /**
   * Get the broker ID value
   * @returns {string}
   */
  get value() {
    return this._value;
  }

  /**
   * Check equality with another BrokerId
   * @param {BrokerId} other - BrokerId instance to compare with
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof BrokerId)) {
      return false;
    }
    return this._value === other._value;
  }

  /**
   * Format as string
   * @returns {string}
   */
  toString() {
    return this._value;
  }

  /**
   * Convert to plain value
   * @returns {string}
   */
  toJSON() {
    return this._value;
  }

  /**
   * Validate broker ID value
   * @param {string} value - Broker ID value to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   * @private
   */
  static _validate(value) {
    const errors = [];

    // Assume value is already a string and trimmed (called after normalization)
    if (value.length === 0) {
      errors.push('Broker ID cannot be empty');
      return { valid: false, errors };
    }

    // Match lowercase alphanumeric + underscore + hyphen
    if (!/^[a-z0-9_-]+$/.test(value)) {
      errors.push('Broker ID can only contain lowercase alphanumeric characters, hyphens, and underscores');
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Static factory method: Create BrokerId from string
   * @param {string} value - Broker ID value
   * @returns {BrokerId}
   */
  static of(value) {
    return new BrokerId(value);
  }

  /**
   * Static factory method: Create BrokerId from JSON
   * @param {string} json - JSON value (or plain string)
   * @returns {BrokerId}
   */
  static fromJSON(json) {
    if (typeof json === 'string') {
      return new BrokerId(json);
    }
    if (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'value')) {
      return new BrokerId(json.value);
    }
    throw ValidationError.forField('json', 'JSON must be a string or object with value property');
  }

  /**
   * Static method: Validate broker ID without creating instance
   * @param {string} value - Broker ID value to validate
   * @returns {boolean}
   */
  static isValid(value) {
    if (value === null || value === undefined || typeof value !== 'string') {
      return false;
    }
    const normalizedValue = value.trim().toLowerCase();
    const validation = BrokerId._validate(normalizedValue);
    return validation.valid;
  }
}

module.exports = BrokerId;
