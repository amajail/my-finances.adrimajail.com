/**
 * Base application error class
 * All custom errors in the application should extend from this class
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {boolean} isOperational - Whether error is operational (expected) or programming error
   * @param {Object} metadata - Additional error metadata
   */
  constructor(message, statusCode = 500, isOperational = true, metadata = {}) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON representation
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      metadata: this.metadata,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Convert error to user-friendly representation (without stack trace)
   */
  toUserFriendly() {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

module.exports = AppError;
