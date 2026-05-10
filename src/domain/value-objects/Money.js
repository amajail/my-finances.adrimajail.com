/**
 * Money Value Object
 *
 * Represents a monetary amount with currency.
 * Immutable value object following DDD principles.
 *
 * @see https://martinfowler.com/eaaCatalog/money.html
 */

const { DomainError, ValidationError } = require('../../shared/errors');
const { AmountValidator } = require('../../shared/validation/validators');
const currencyUtils = require('../../shared/utils/currency.utils');

class Money {
  /**
   * Create a Money instance
   * @param {number} amount - The monetary amount
   * @param {string} currency - Currency code (ARS, USD, EUR, etc.)
   * @throws {ValidationError} If amount or currency is invalid
   */
  constructor(amount, currency = 'ARS') {
    // Validate amount (allow positive, negative, and zero)
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || !isFinite(numAmount)) {
      throw ValidationError.forField('amount', 'Amount must be a valid finite number');
    }

    // Validate currency
    const normalizedCurrency = currencyUtils.normalizeCurrencyCode(currency);
    if (!currencyUtils.validateCurrencyCode(normalizedCurrency)) {
      throw ValidationError.forField('currency', `Invalid currency code: ${currency}`);
    }

    // Store values as private properties (using symbols for privacy)
    Object.defineProperty(this, '_amount', {
      value: currencyUtils.roundCurrency(numAmount),
      writable: false,
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(this, '_currency', {
      value: normalizedCurrency,
      writable: false,
      enumerable: false,
      configurable: false
    });

    // Freeze the object to ensure immutability
    Object.freeze(this);
  }

  /**
   * Get the amount
   * @returns {number}
   */
  get amount() {
    return this._amount;
  }

  /**
   * Get the currency code
   * @returns {string}
   */
  get currency() {
    return this._currency;
  }

  /**
   * Check if amount is zero
   * @returns {boolean}
   */
  isZero() {
    return currencyUtils.areAmountsEqual(this._amount, 0);
  }

  /**
   * Check if amount is positive
   * @returns {boolean}
   */
  isPositive() {
    return this._amount > 0;
  }

  /**
   * Check if amount is negative
   * @returns {boolean}
   */
  isNegative() {
    return this._amount < 0;
  }

  /**
   * Add another Money instance
   * @param {Money} other - Money instance to add
   * @returns {Money} New Money instance with the sum
   * @throws {DomainError} If currencies don't match
   */
  add(other) {
    this._ensureSameCurrency(other);
    const newAmount = currencyUtils.addAmounts(this._amount, other._amount);
    return new Money(newAmount, this._currency);
  }

  /**
   * Subtract another Money instance
   * @param {Money} other - Money instance to subtract
   * @returns {Money} New Money instance with the difference
   * @throws {DomainError} If currencies don't match
   */
  subtract(other) {
    this._ensureSameCurrency(other);
    const newAmount = currencyUtils.subtractAmounts(this._amount, other._amount);
    return new Money(newAmount, this._currency);
  }

  /**
   * Multiply by a number
   * @param {number} multiplier - Number to multiply by
   * @returns {Money} New Money instance with the product
   * @throws {ValidationError} If multiplier is invalid
   */
  multiply(multiplier) {
    if (typeof multiplier !== 'number' || isNaN(multiplier)) {
      throw ValidationError.forField('multiplier', 'Multiplier must be a valid number');
    }
    const newAmount = currencyUtils.multiplyAmount(this._amount, multiplier);
    return new Money(newAmount, this._currency);
  }

  /**
   * Divide by a number
   * @param {number} divisor - Number to divide by
   * @returns {Money} New Money instance with the quotient
   * @throws {ValidationError} If divisor is invalid or zero
   */
  divide(divisor) {
    if (typeof divisor !== 'number' || isNaN(divisor) || divisor === 0) {
      throw ValidationError.forField('divisor', 'Divisor must be a valid non-zero number');
    }
    const newAmount = currencyUtils.divideAmount(this._amount, divisor);
    return new Money(newAmount, this._currency);
  }

  /**
   * Calculate percentage of this amount
   * @param {number} percentage - Percentage (e.g., 21 for 21%)
   * @returns {Money} New Money instance with the percentage amount
   */
  percentage(percentage) {
    const newAmount = currencyUtils.calculatePercentage(this._amount, percentage);
    return new Money(newAmount, this._currency);
  }

  /**
   * Convert to another currency
   * @param {string} toCurrency - Target currency code
   * @param {number} exchangeRate - Exchange rate (toCurrency per 1 fromCurrency)
   * @returns {Money} New Money instance in target currency
   */
  convertTo(toCurrency, exchangeRate) {
    const normalizedToCurrency = currencyUtils.normalizeCurrencyCode(toCurrency);

    if (!currencyUtils.validateCurrencyCode(normalizedToCurrency)) {
      throw ValidationError.forField('toCurrency', `Invalid currency code: ${toCurrency}`);
    }

    const convertedAmount = currencyUtils.convertCurrency(
      this._amount,
      this._currency,
      normalizedToCurrency,
      exchangeRate
    );

    return new Money(convertedAmount, normalizedToCurrency);
  }

  /**
   * Compare with another Money instance
   * @param {Money} other - Money instance to compare with
   * @returns {number} -1 if less, 0 if equal, 1 if greater
   * @throws {DomainError} If currencies don't match
   */
  compareTo(other) {
    this._ensureSameCurrency(other);
    return currencyUtils.compareCurrencyAmounts(this._amount, other._amount);
  }

  /**
   * Check if equal to another Money instance
   * @param {Money} other - Money instance to compare with
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof Money)) {
      return false;
    }
    return this._currency === other._currency &&
           currencyUtils.areAmountsEqual(this._amount, other._amount);
  }

  /**
   * Check if greater than another Money instance
   * @param {Money} other - Money instance to compare with
   * @returns {boolean}
   * @throws {DomainError} If currencies don't match
   */
  isGreaterThan(other) {
    return this.compareTo(other) > 0;
  }

  /**
   * Check if less than another Money instance
   * @param {Money} other - Money instance to compare with
   * @returns {boolean}
   * @throws {DomainError} If currencies don't match
   */
  isLessThan(other) {
    return this.compareTo(other) < 0;
  }

  /**
   * Check if greater than or equal to another Money instance
   * @param {Money} other - Money instance to compare with
   * @returns {boolean}
   * @throws {DomainError} If currencies don't match
   */
  isGreaterThanOrEqual(other) {
    return this.compareTo(other) >= 0;
  }

  /**
   * Check if less than or equal to another Money instance
   * @param {Money} other - Money instance to compare with
   * @returns {boolean}
   * @throws {DomainError} If currencies don't match
   */
  isLessThanOrEqual(other) {
    return this.compareTo(other) <= 0;
  }

  /**
   * Get absolute value
   * @returns {Money} New Money instance with absolute value
   */
  abs() {
    return new Money(Math.abs(this._amount), this._currency);
  }

  /**
   * Negate the amount
   * @returns {Money} New Money instance with negated amount
   */
  negate() {
    return new Money(-this._amount, this._currency);
  }

  /**
   * Format as string
   * @param {Object} options - Format options
   * @returns {string}
   */
  format(options = {}) {
    return currencyUtils.formatCurrencyAmount(this._amount, this._currency);
  }

  /**
   * Convert to plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      amount: this._amount,
      currency: this._currency
    };
  }

  /**
   * String representation
   * @returns {string}
   */
  toString() {
    return this.format();
  }

  /**
   * Ensure another Money instance has the same currency
   * @param {Money} other - Money instance to check
   * @throws {DomainError} If currencies don't match
   * @private
   */
  _ensureSameCurrency(other) {
    if (!(other instanceof Money)) {
      throw new DomainError('Operand must be a Money instance');
    }
    if (this._currency !== other._currency) {
      throw new DomainError(
        `Cannot operate on different currencies: ${this._currency} and ${other._currency}`
      );
    }
  }

  /**
   * Static factory method: Create Money from amount and currency
   * @param {number} amount - Amount
   * @param {string} currency - Currency code
   * @returns {Money}
   */
  static of(amount, currency = 'ARS') {
    return new Money(amount, currency);
  }

  /**
   * Static factory method: Create zero Money
   * @param {string} currency - Currency code
   * @returns {Money}
   */
  static zero(currency = 'ARS') {
    return new Money(0, currency);
  }

  /**
   * Static factory method: Create Money from JSON object
   * @param {Object} json - JSON object with amount and currency
   * @returns {Money}
   */
  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw ValidationError.forField('json', 'Invalid JSON object');
    }
    if (!json.hasOwnProperty('amount') || !json.hasOwnProperty('currency')) {
      throw ValidationError.forField('json', 'JSON must have amount and currency properties');
    }
    return new Money(json.amount, json.currency);
  }

  /**
   * Static method: Sum multiple Money instances
   * @param {...Money} moneys - Money instances to sum
   * @returns {Money} New Money instance with the sum
   * @throws {DomainError} If currencies don't match or no instances provided
   */
  static sum(...moneys) {
    if (moneys.length === 0) {
      throw new DomainError('Cannot sum zero Money instances');
    }

    // Ensure all are Money instances and have same currency
    const currency = moneys[0].currency;
    for (const money of moneys) {
      if (!(money instanceof Money)) {
        throw new DomainError('All arguments must be Money instances');
      }
      if (money.currency !== currency) {
        throw new DomainError('All Money instances must have the same currency');
      }
    }

    const amounts = moneys.map(m => m.amount);
    const totalAmount = currencyUtils.addAmounts(...amounts);
    return new Money(totalAmount, currency);
  }

  /**
   * Static method: Get minimum Money instance
   * @param {...Money} moneys - Money instances to compare
   * @returns {Money} Money instance with minimum amount
   * @throws {DomainError} If currencies don't match or no instances provided
   */
  static min(...moneys) {
    if (moneys.length === 0) {
      throw new DomainError('Cannot get min of zero Money instances');
    }

    let minMoney = moneys[0];
    for (let i = 1; i < moneys.length; i++) {
      if (moneys[i].isLessThan(minMoney)) {
        minMoney = moneys[i];
      }
    }
    return minMoney;
  }

  /**
   * Static method: Get maximum Money instance
   * @param {...Money} moneys - Money instances to compare
   * @returns {Money} Money instance with maximum amount
   * @throws {DomainError} If currencies don't match or no instances provided
   */
  static max(...moneys) {
    if (moneys.length === 0) {
      throw new DomainError('Cannot get max of zero Money instances');
    }

    let maxMoney = moneys[0];
    for (let i = 1; i < moneys.length; i++) {
      if (moneys[i].isGreaterThan(maxMoney)) {
        maxMoney = moneys[i];
      }
    }
    return maxMoney;
  }
}

module.exports = Money;
