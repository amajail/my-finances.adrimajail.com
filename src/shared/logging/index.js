/**
 * Logging Layer Exports
 *
 * Provides a centralized logging system with support for:
 * - Console logging (CLI/development)
 * - Application Insights (Azure Functions)
 * - Automatic logger selection based on environment
 */

const Logger = require('./Logger');
const ConsoleLogger = require('./loggers/ConsoleLogger');
const ApplicationInsightsLogger = require('./loggers/ApplicationInsightsLogger');
const LoggerFactory = require('./LoggerFactory');
const config = require('../config');

// Create default logger instance using factory
const defaultLogger = LoggerFactory.createLogger({
  level: config.app.logLevel
});

module.exports = {
  // Export classes for manual instantiation
  Logger,
  ConsoleLogger,
  ApplicationInsightsLogger,
  LoggerFactory,

  // Export default logger instance
  default: defaultLogger,

  // Export convenience methods from default logger
  error: defaultLogger.error.bind(defaultLogger),
  warn: defaultLogger.warn.bind(defaultLogger),
  info: defaultLogger.info.bind(defaultLogger),
  http: defaultLogger.http.bind(defaultLogger),
  debug: defaultLogger.debug.bind(defaultLogger),
  log: defaultLogger.log.bind(defaultLogger),

  // Export domain-specific helpers
  logPortfolioUpdate: defaultLogger.logPortfolioUpdate.bind(defaultLogger),
  logPortfolioUpdateFailure: defaultLogger.logPortfolioUpdateFailure.bind(defaultLogger),
  logDatabaseOperation: defaultLogger.logDatabaseOperation.bind(defaultLogger),
  logApiCall: defaultLogger.logApiCall.bind(defaultLogger),
  logStartup: defaultLogger.logStartup.bind(defaultLogger),
  logShutdown: defaultLogger.logShutdown.bind(defaultLogger)
};
