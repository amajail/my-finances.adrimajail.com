/**
 * Abstract Logger Base Class
 *
 * Defines the interface that all logger implementations must follow.
 * Provides standard log levels and helper methods for common logging patterns.
 */

class Logger {
  /**
   * Log levels in order of severity
   */
  static LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    HTTP: 'http',
    DEBUG: 'debug'
  };

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Object} metadata - Additional context
   */
  error(message, metadata = {}) {
    throw new Error('error() must be implemented by subclass');
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional context
   */
  warn(message, metadata = {}) {
    throw new Error('warn() must be implemented by subclass');
  }

  /**
   * Log an informational message
   * @param {string} message - Info message
   * @param {Object} metadata - Additional context
   */
  info(message, metadata = {}) {
    throw new Error('info() must be implemented by subclass');
  }

  /**
   * Log an HTTP request/response
   * @param {string} message - HTTP message
   * @param {Object} metadata - Additional context
   */
  http(message, metadata = {}) {
    throw new Error('http() must be implemented by subclass');
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} metadata - Additional context
   */
  debug(message, metadata = {}) {
    throw new Error('debug() must be implemented by subclass');
  }

  /**
   * Log a message at the specified level
   * @param {string} level - Log level (error, warn, info, http, debug)
   * @param {string} message - Log message
   * @param {Object} metadata - Additional context
   */
  log(level, message, metadata = {}) {
    throw new Error('log() must be implemented by subclass');
  }

  // ===== Domain-Specific Helper Methods =====
  // These provide consistent logging for common application events

  /**
   * Log successful portfolio update
   * @param {Object} details - Update details
   */
  logPortfolioUpdate(details = {}) {
    this.info('Portfolio updated', {
      ...details,
      event: 'portfolio_updated'
    });
  }

  /**
   * Log portfolio update failure
   * @param {Error|string} error - Error that occurred
   */
  logPortfolioUpdateFailure(error) {
    this.error('Portfolio update failed', {
      error: error.message || error,
      event: 'portfolio_update_failed'
    });
  }

  /**
   * Log database operation
   * @param {string} operation - Operation name
   * @param {Object} details - Operation details
   */
  logDatabaseOperation(operation, details = {}) {
    this.debug(`Database operation: ${operation}`, {
      operation,
      ...details,
      event: 'database_operation'
    });
  }

  /**
   * Log external API call
   * @param {string} service - Service name
   * @param {string} method - API method called
   * @param {Object} details - Call details
   */
  logApiCall(service, method, details = {}) {
    this.info(`${service} API call: ${method}`, {
      service,
      method,
      ...details,
      event: 'api_call'
    });
  }

  /**
   * Log application startup
   * @param {Object} config - Application configuration summary
   */
  logStartup(config = {}) {
    this.info('Application started', {
      ...config,
      event: 'app_startup'
    });
  }

  /**
   * Log application shutdown
   * @param {Object} stats - Shutdown statistics
   */
  logShutdown(stats = {}) {
    this.info('Application shutting down', {
      ...stats,
      event: 'app_shutdown'
    });
  }
}

module.exports = Logger;
