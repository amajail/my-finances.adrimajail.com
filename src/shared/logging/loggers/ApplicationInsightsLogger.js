/**
 * Application Insights Logger Implementation
 *
 * Logger implementation for Azure Functions environments.
 * Sends telemetry data to Azure Application Insights for monitoring and diagnostics.
 */

const Logger = require('../Logger');

class ApplicationInsightsLogger extends Logger {
  /**
   * @param {Object} options - Logger configuration
   * @param {string} options.instrumentationKey - Application Insights instrumentation key
   * @param {string} options.level - Minimum log level (default: 'info')
   * @param {Object} options.appInsights - Optional pre-configured appInsights client
   * @param {boolean} options.enableConsole - Also log to console (default: true)
   * @param {Object} options.defaultProperties - Properties to include in all telemetry
   */
  constructor(options = {}) {
    super();

    const {
      instrumentationKey,
      level = 'info',
      appInsights = null,
      enableConsole = true,
      defaultProperties = {}
    } = options;

    this.level = level;
    this.enableConsole = enableConsole;
    this.defaultProperties = defaultProperties;

    // Log level severity mapping
    this.levelSeverity = {
      error: 3, // SeverityLevel.Error
      warn: 2,  // SeverityLevel.Warning
      info: 1,  // SeverityLevel.Information
      http: 1,  // SeverityLevel.Information
      debug: 0  // SeverityLevel.Verbose
    };

    // Check if should skip levels based on configuration
    this.levelPriority = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4
    };

    // Initialize Application Insights
    if (appInsights) {
      // Use provided instance (for testing or custom configuration)
      this.appInsights = appInsights;
      this.client = appInsights.defaultClient;
    } else if (instrumentationKey) {
      // Initialize Application Insights with instrumentation key
      try {
        const appInsights = require('applicationinsights');
        appInsights
          .setup(instrumentationKey)
          .setAutoDependencyCorrelation(true)
          .setAutoCollectRequests(true)
          .setAutoCollectPerformance(true, true)
          .setAutoCollectExceptions(true)
          .setAutoCollectDependencies(true)
          .setAutoCollectConsole(false) // We handle logging ourselves
          .setUseDiskRetryCaching(true)
          .start();

        this.appInsights = appInsights;
        this.client = appInsights.defaultClient;

        // Add default properties
        this.client.commonProperties = {
          ...this.client.commonProperties,
          ...defaultProperties
        };
      } catch (error) {
        console.warn(
          'Failed to initialize Application Insights:',
          error.message
        );
        this.appInsights = null;
        this.client = null;
      }
    } else {
      // No instrumentation key provided
      this.appInsights = null;
      this.client = null;
    }
  }

  /**
   * Check if a log level should be processed
   */
  _shouldLog(level) {
    return this.levelPriority[level] <= this.levelPriority[this.level];
  }

  /**
   * Send trace telemetry to Application Insights
   */
  _trackTrace(level, message, properties = {}) {
    if (!this._shouldLog(level)) {
      return;
    }

    // Always log to console if enabled
    if (this.enableConsole) {
      console.log(`[${level.toUpperCase()}] ${message}`, properties);
    }

    // Send to Application Insights if available
    if (this.client) {
      this.client.trackTrace({
        message,
        severity: this.levelSeverity[level],
        properties: {
          ...this.defaultProperties,
          ...properties,
          level
        }
      });
    }
  }

  /**
   * Send exception telemetry to Application Insights
   */
  _trackException(error, properties = {}) {
    // Always log to console if enabled
    if (this.enableConsole) {
      console.error('[ERROR]', error, properties);
    }

    // Send to Application Insights if available
    if (this.client) {
      this.client.trackException({
        exception: error instanceof Error ? error : new Error(error),
        properties: {
          ...this.defaultProperties,
          ...properties
        }
      });
    }
  }

  /**
   * Log an error message
   */
  error(message, metadata = {}) {
    // If metadata contains an error object, track it as an exception
    if (metadata.error instanceof Error) {
      this._trackException(metadata.error, {
        message,
        ...metadata
      });
    } else {
      this._trackTrace('error', message, metadata);
    }
  }

  /**
   * Log a warning message
   */
  warn(message, metadata = {}) {
    this._trackTrace('warn', message, metadata);
  }

  /**
   * Log an informational message
   */
  info(message, metadata = {}) {
    this._trackTrace('info', message, metadata);
  }

  /**
   * Log an HTTP request/response
   */
  http(message, metadata = {}) {
    this._trackTrace('http', message, metadata);

    // Track as dependency if request details are provided
    if (this.client && metadata.url && metadata.duration) {
      this.client.trackDependency({
        target: metadata.url,
        name: metadata.method || 'HTTP',
        data: metadata.url,
        duration: metadata.duration,
        resultCode: metadata.statusCode || 0,
        success: metadata.success !== false,
        dependencyTypeName: 'HTTP'
      });
    }
  }

  /**
   * Log a debug message
   */
  debug(message, metadata = {}) {
    this._trackTrace('debug', message, metadata);
  }

  /**
   * Log a message at the specified level
   */
  log(level, message, metadata = {}) {
    if (level === 'error') {
      this.error(message, metadata);
    } else {
      this._trackTrace(level, message, metadata);
    }
  }

  /**
   * Track a custom event
   * @param {string} name - Event name
   * @param {Object} properties - Event properties
   * @param {Object} measurements - Event measurements (numeric values)
   */
  trackEvent(name, properties = {}, measurements = {}) {
    if (this.client) {
      this.client.trackEvent({
        name,
        properties: {
          ...this.defaultProperties,
          ...properties
        },
        measurements
      });
    }
  }

  /**
   * Track a metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} properties - Additional properties
   */
  trackMetric(name, value, properties = {}) {
    if (this.client) {
      this.client.trackMetric({
        name,
        value,
        properties: {
          ...this.defaultProperties,
          ...properties
        }
      });
    }
  }

  /**
   * Flush telemetry buffer
   * Useful before shutting down to ensure all telemetry is sent
   */
  flush() {
    if (this.client) {
      this.client.flush();
    }
  }

  /**
   * Set default properties for all telemetry
   */
  setDefaultProperties(properties) {
    this.defaultProperties = {
      ...this.defaultProperties,
      ...properties
    };

    if (this.client) {
      this.client.commonProperties = {
        ...this.client.commonProperties,
        ...properties
      };
    }
  }
}

module.exports = ApplicationInsightsLogger;
