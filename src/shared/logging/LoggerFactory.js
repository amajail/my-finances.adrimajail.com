/**
 * Logger Factory
 *
 * Creates the appropriate logger instance based on runtime environment.
 * - CLI/Development: ConsoleLogger (Winston-based)
 * - Azure Functions: ApplicationInsightsLogger
 * - Test: Silent ConsoleLogger
 */

const ConsoleLogger = require('./loggers/ConsoleLogger');
const ApplicationInsightsLogger = require('./loggers/ApplicationInsightsLogger');
const environment = require('../config/environment');

class LoggerFactory {
  /**
   * Create a logger instance based on runtime environment
   *
   * @param {Object} options - Logger configuration
   * @param {string} options.level - Log level (error, warn, info, http, debug)
   * @param {string} options.type - Force specific logger type ('console', 'appinsights')
   * @param {Object} options.config - Additional logger-specific configuration
   * @returns {Logger}
   */
  static createLogger(options = {}) {
    const {
      level,
      type = null,
      config = {}
    } = options;

    // Determine logger type if not explicitly specified
    const loggerType = type || LoggerFactory._determineLoggerType();

    // Create logger based on type
    switch (loggerType) {
      case 'appinsights':
        return LoggerFactory._createApplicationInsightsLogger(level, config);

      case 'console':
      default:
        return LoggerFactory._createConsoleLogger(level, config);
    }
  }

  /**
   * Determine which logger type to use based on environment
   * @private
   */
  static _determineLoggerType() {
    // Azure Functions environment
    if (environment.isAzureFunctions()) {
      return 'appinsights';
    }

    // CLI or development environment
    return 'console';
  }

  /**
   * Create ConsoleLogger instance
   * @private
   */
  static _createConsoleLogger(level, config = {}) {
    const isTest = environment.isTest();
    const isDev = environment.isDevelopment();

    const defaultConfig = {
      level: level || (isTest ? 'error' : (isDev ? 'debug' : 'info')),
      colorize: !isTest,
      includeTimestamp: !isTest,
      writeToFile: !isTest,
      silent: isTest
    };

    return new ConsoleLogger({
      ...defaultConfig,
      ...config
    });
  }

  /**
   * Create ApplicationInsightsLogger instance
   * @private
   */
  static _createApplicationInsightsLogger(level, config = {}) {
    // Get instrumentation key from environment
    const instrumentationKey = process.env.APPINSIGHTS_INSTRUMENTATIONKEY ||
                               process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

    if (!instrumentationKey) {
      console.warn(
        'Application Insights instrumentation key not found. Falling back to ConsoleLogger.'
      );
      return LoggerFactory._createConsoleLogger(level, config);
    }

    const defaultConfig = {
      instrumentationKey,
      level: level || 'info',
      enableConsole: environment.isDevelopment(),
      defaultProperties: {
        environment: environment.getNodeEnv(),
        runtimeContext: environment.getRuntimeContext()
      }
    };

    return new ApplicationInsightsLogger({
      ...defaultConfig,
      ...config
    });
  }

  /**
   * Create a logger from configuration object
   *
   * @param {Object} configObject - Configuration object with logger settings
   * @returns {Logger}
   */
  static fromConfig(configObject) {
    const {
      logging = {},
      environment: envConfig = {}
    } = configObject;

    return LoggerFactory.createLogger({
      level: logging.logLevel,
      config: {
        ...logging,
        ...(envConfig.runtime === 'api' ? {
          instrumentationKey: envConfig.applicationInsightsKey
        } : {})
      }
    });
  }

  /**
   * Create a logger specifically for testing
   * Silent console logger that captures logs
   *
   * @returns {ConsoleLogger}
   */
  static createTestLogger() {
    return new ConsoleLogger({
      level: 'debug',
      colorize: false,
      includeTimestamp: false,
      writeToFile: false,
      silent: true
    });
  }
}

module.exports = LoggerFactory;
