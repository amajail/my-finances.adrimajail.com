const AppError = require('./AppError');

/**
 * Infrastructure error for external system failures
 * Used when database, API, file system, or other external dependencies fail
 */
class InfrastructureError extends AppError {
  /**
   * @param {string} message - Error message describing the infrastructure failure
   * @param {Object} metadata - Additional context (e.g., service name, error code)
   * @param {Error} originalError - The original error from the external system
   */
  constructor(message, metadata = {}, originalError = null) {
    const enrichedMetadata = {
      ...metadata,
      originalError: originalError ? {
        message: originalError.message,
        name: originalError.name,
        code: originalError.code
      } : null
    };

    super(message, 503, true, enrichedMetadata); // 503 Service Unavailable
    this.originalError = originalError;
  }

  /**
   * Create InfrastructureError for database failures
   */
  static database(message, originalError = null) {
    return new InfrastructureError(
      message,
      { subsystem: 'database' },
      originalError
    );
  }

  /**
   * Create InfrastructureError for external API failures
   */
  static externalApi(serviceName, message, originalError = null) {
    return new InfrastructureError(
      message,
      { subsystem: 'external-api', serviceName },
      originalError
    );
  }

  /**
   * Create InfrastructureError for file system failures
   */
  static fileSystem(message, originalError = null) {
    return new InfrastructureError(
      message,
      { subsystem: 'file-system' },
      originalError
    );
  }
}

module.exports = InfrastructureError;
