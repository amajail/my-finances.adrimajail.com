const AppError = require('./AppError');

/**
 * Validation error for input validation failures
 * Used when user input or data fails validation rules
 */
class ValidationError extends AppError {
  /**
   * @param {string} message - Error message describing the validation failure
   * @param {Array<Object>} validationErrors - Array of specific validation errors
   * @param {Object} metadata - Additional context
   */
  constructor(message, validationErrors = [], metadata = {}) {
    super(message, 400, true, { ...metadata, validationErrors }); // 400 Bad Request
    this.validationErrors = validationErrors;
  }

  /**
   * Create ValidationError from multiple field errors
   * @param {Array<{field: string, message: string}>} errors - Array of field validation errors
   */
  static fromFieldErrors(errors) {
    const message = `Validation failed for ${errors.length} field(s)`;
    return new ValidationError(message, errors);
  }

  /**
   * Create ValidationError for a single field
   * @param {string} field - Field name
   * @param {string} message - Error message
   */
  static forField(field, message) {
    return new ValidationError(
      `Validation failed for field: ${field}`,
      [{ field, message }]
    );
  }
}

module.exports = ValidationError;
