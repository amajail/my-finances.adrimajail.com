const AppError = require('./AppError');

/**
 * Domain error for business rule violations
 * Used when domain logic constraints are violated
 */
class DomainError extends AppError {
  /**
   * @param {string} message - Error message describing the business rule violation
   * @param {Object} metadata - Additional context (e.g., entity name, violated rule)
   */
  constructor(message, metadata = {}) {
    super(message, 422, true, metadata); // 422 Unprocessable Entity
  }
}

module.exports = DomainError;
