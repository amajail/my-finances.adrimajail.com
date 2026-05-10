/**
 * Quantity Value Object
 *
 * Represents a numeric quantity of an asset.
 * Allows zero and positive numbers, including decimals (for bonds with fractional nominales).
 * Immutable value object following DDD principles.
 */

const { ValidationError } = require('../../shared/errors');

class Quantity {
  /**
   * Create a Quantity instance
   * @param {number} value - Quantity value
   * @throws {ValidationError} If quantity is invalid
   */
  constructor(value) {
    // Validate quantity
    const validation = Quantity._validate(value);
    if (!validation.valid) {
      throw ValidationError.forField('quantity', validation.errors.join(', '));
    }

    // Store value as a number
    const numValue = parseFloat(value);

    Object.defineProperty(this, '_value', {
      value: numValue,
      writable: false,
      enumerable: false,
      configurable: false
    });

    // Freeze the object to ensure immutability
    Object.freeze(this);
  }

  /**
   * Get the quantity value
   * @returns {number}
   */
  get value() {
    return this._value;
  }

  /**
   * Check if quantity is zero
   * @returns {boolean}
   */
  isZero() {
    return this._value === 0;
  }

  /**
   * Check equality with another Quantity
   * @param {Quantity} other - Quantity instance to compare with
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof Quantity)) {
      return false;
    }
    return this._value === other._value;
  }

  /**
   * Add another Quantity
   * @param {Quantity} other - Quantity instance to add
   * @returns {Quantity} New Quantity instance with the sum
   */
  add(other) {
    if (!(other instanceof Quantity)) {
      throw new TypeError('Operand must be a Quantity instance');
    }
    return new Quantity(this._value + other._value);
  }

  /**
   * Subtract another Quantity
   * @param {Quantity} other - Quantity instance to subtract
   * @returns {Quantity} New Quantity instance with the difference
   * @throws {ValidationError} If result would be negative
   */
  subtract(other) {
    if (!(other instanceof Quantity)) {
      throw new TypeError('Operand must be a Quantity instance');
    }
    const result = this._value - other._value;
    if (result < 0) {
      throw ValidationError.forField(
        'quantity',
        'Cannot subtract: result would be negative'
      );
    }
    return new Quantity(result);
  }

  /**
   * Format as string
   * @returns {string}
   */
  toString() {
    return String(this._value);
  }

  /**
   * Convert to plain value
   * @returns {number}
   */
  toJSON() {
    return this._value;
  }

  /**
   * Validate quantity value
   * @param {number} value - Quantity value to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   * @private
   */
  static _validate(value) {
    const errors = [];

    // Check if it's a number
    const numValue = parseFloat(value);
    if (typeof value !== 'number' && typeof value !== 'string') {
      errors.push('Quantity must be a number');
      return { valid: false, errors };
    }

    if (isNaN(numValue)) {
      errors.push('Quantity must be a valid number');
      return { valid: false, errors };
    }

    // Check if finite
    if (!isFinite(numValue)) {
      errors.push('Quantity must be a finite number');
      return { valid: false, errors };
    }

    // Check if negative
    if (numValue < 0) {
      errors.push('Quantity cannot be negative');
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Static factory method: Create Quantity from number
   * @param {number} value - Quantity value
   * @returns {Quantity}
   */
  static of(value) {
    return new Quantity(value);
  }

  /**
   * Static factory method: Create zero Quantity
   * @returns {Quantity}
   */
  static zero() {
    return new Quantity(0);
  }

  /**
   * Static factory method: Create Quantity from JSON
   * @param {number} json - JSON value
   * @returns {Quantity}
   */
  static fromJSON(json) {
    if (typeof json !== 'number') {
      throw ValidationError.forField('json', 'JSON must be a number');
    }
    return new Quantity(json);
  }

  /**
   * Static method: Validate quantity without creating instance
   * @param {number} value - Quantity value to validate
   * @returns {boolean}
   */
  static isValid(value) {
    const validation = Quantity._validate(value);
    return validation.valid;
  }
}

module.exports = Quantity;
