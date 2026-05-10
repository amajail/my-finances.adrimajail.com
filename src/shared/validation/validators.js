/**
 * Input Validation Utilities
 *
 * Provides comprehensive validation for portfolio tracker application.
 * All validators return { valid: boolean, errors: string[] }
 */

const { ValidationError } = require('../errors');

/**
 * Amount Validator
 *
 * Validates monetary amounts
 */
class AmountValidator {
  /**
   * Validate amount
   * @param {number|string} amount - Amount to validate
   * @param {Object} options - Validation options
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validate(amount, options = {}) {
    const {
      min = 0,
      max = 999999999,
      allowZero = false,
      fieldName = 'amount'
    } = options;

    const errors = [];
    const numAmount = parseFloat(amount);

    // Check if it's a valid number
    if (isNaN(numAmount)) {
      errors.push(`${fieldName} must be a valid number`);
      return { valid: false, errors };
    }

    // Check if finite
    if (!isFinite(numAmount)) {
      errors.push(`${fieldName} must be a finite number`);
      return { valid: false, errors };
    }

    // Check minimum
    if (!allowZero && numAmount <= min) {
      errors.push(`${fieldName} must be greater than ${min}`);
      return { valid: false, errors };
    }

    if (allowZero && numAmount < min) {
      errors.push(`${fieldName} must be at least ${min}`);
      return { valid: false, errors };
    }

    // Check maximum
    if (numAmount > max) {
      errors.push(`${fieldName} cannot exceed ${max.toLocaleString()}`);
      return { valid: false, errors };
    }

    // Check reasonable precision (max 2 decimal places for currency)
    const decimalPlaces = (String(numAmount).split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      errors.push(`${fieldName} cannot have more than 2 decimal places`);
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate and throw error if invalid
   * @param {number|string} amount - Amount to validate
   * @param {Object} options - Validation options
   * @throws {ValidationError}
   */
  static validateOrThrow(amount, options = {}) {
    const result = this.validate(amount, options);
    if (!result.valid) {
      throw ValidationError.forField(
        options.fieldName || 'amount',
        result.errors.join(', ')
      );
    }
  }
}

/**
 * Date Validator
 *
 * Validates dates
 */
class DateValidator {
  /**
   * Validate date format
   * @param {string|Date} date - Date to validate
   * @param {Object} options - Validation options
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validate(date, options = {}) {
    const {
      allowPast = true,
      allowFuture = false,
      maxDaysInPast = null,
      maxDaysInFuture = 0,
      fieldName = 'date'
    } = options;

    const errors = [];

    // Parse date
    let dateObj;
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      // Try to parse YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`${fieldName} must be in YYYY-MM-DD format`);
        return { valid: false, errors };
      }
      dateObj = new Date(date);
    } else {
      errors.push(`${fieldName} must be a Date object or YYYY-MM-DD string`);
      return { valid: false, errors };
    }

    // Check if valid date
    if (isNaN(dateObj.getTime())) {
      errors.push(`${fieldName} is not a valid date`);
      return { valid: false, errors };
    }

    // Get today at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dateOnly = new Date(dateObj);
    dateOnly.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((dateOnly - today) / (1000 * 60 * 60 * 24));

    // Check past dates
    if (!allowPast && diffDays < 0) {
      errors.push(`${fieldName} cannot be in the past`);
    }

    // Check future dates
    if (!allowFuture && diffDays > 0) {
      errors.push(`${fieldName} cannot be in the future`);
    }

    // Check max days in past
    if (maxDaysInPast !== null && diffDays < -maxDaysInPast) {
      errors.push(`${fieldName} cannot be more than ${maxDaysInPast} days in the past`);
    }

    // Check max days in future
    if (maxDaysInFuture !== null && diffDays > maxDaysInFuture) {
      errors.push(`${fieldName} cannot be more than ${maxDaysInFuture} days in the future`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate and throw error if invalid
   * @param {string|Date} date - Date to validate
   * @param {Object} options - Validation options
   * @throws {ValidationError}
   */
  static validateOrThrow(date, options = {}) {
    const result = this.validate(date, options);
    if (!result.valid) {
      throw ValidationError.forField(
        options.fieldName || 'date',
        result.errors.join(', ')
      );
    }
  }
}

module.exports = {
  AmountValidator,
  DateValidator
};
