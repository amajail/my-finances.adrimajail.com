/**
 * Symbol Value Object
 *
 * Represents an asset's ticker symbol, bond code, or currency code.
 * Examples: AAPL, BRK.B, sovereign-bond codes, LECAP codes, USD, ARS
 * Immutable value object following DDD principles.
 */

const { ValidationError } = require('../../shared/errors');

class Symbol {
  /**
   * Create a Symbol instance
   * @param {string} value - Symbol value (ticker, bond code, currency code)
   * @throws {ValidationError} If symbol is invalid
   */
  constructor(value) {
    // Validate symbol
    const validation = Symbol._validate(value);
    if (!validation.valid) {
      throw ValidationError.forField('symbol', validation.errors.join(', '));
    }

    // Store normalized value (trim and uppercase)
    const normalizedValue = String(value).trim().toUpperCase();

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
   * Get the symbol value
   * @returns {string}
   */
  get value() {
    return this._value;
  }

  /**
   * Check equality with another Symbol
   * @param {Symbol} other - Symbol instance to compare with
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof Symbol)) {
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
   * Validate symbol value
   * @param {string} value - Symbol value to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   * @private
   */
  static _validate(value) {
    const errors = [];

    if (value === null || value === undefined) {
      errors.push('Symbol is required');
      return { valid: false, errors };
    }

    const valueStr = String(value).trim();

    if (valueStr.length === 0) {
      errors.push('Symbol cannot be empty');
      return { valid: false, errors };
    }

    // Match pattern: alphanumeric, dots, hyphens, underscores
    // Allows tickers like AAPL or BRK.B, currency codes like USD/ARS, and short alphanumeric bond/LECAP codes
    if (!/^[A-Z0-9._-]+$/i.test(valueStr)) {
      errors.push('Symbol can only contain alphanumeric characters, dots, hyphens, and underscores');
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Static factory method: Create Symbol from string
   * @param {string} value - Symbol value
   * @returns {Symbol}
   */
  static of(value) {
    return new Symbol(value);
  }

  /**
   * Static factory method: Create Symbol from JSON
   * @param {string} json - JSON value (or plain string)
   * @returns {Symbol}
   */
  static fromJSON(json) {
    if (typeof json === 'string') {
      return new Symbol(json);
    }
    if (json && typeof json === 'object' && json.hasOwnProperty('value')) {
      return new Symbol(json.value);
    }
    throw ValidationError.forField('json', 'JSON must be a string or object with value property');
  }

  /**
   * Static method: Validate symbol without creating instance
   * @param {string} value - Symbol value to validate
   * @returns {boolean}
   */
  static isValid(value) {
    const validation = Symbol._validate(value);
    return validation.valid;
  }
}

module.exports = Symbol;
