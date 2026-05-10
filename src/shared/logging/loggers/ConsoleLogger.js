/**
 * Console Logger Implementation
 *
 * Logger implementation for CLI and development environments.
 * Uses Winston for structured logging with colorized console output.
 */

const winston = require('winston');
const path = require('path');
const Logger = require('../Logger');

class ConsoleLogger extends Logger {
  /**
   * @param {Object} options - Logger configuration
   * @param {string} options.level - Log level (error, warn, info, http, debug)
   * @param {boolean} options.colorize - Enable colored output (default: true)
   * @param {boolean} options.includeTimestamp - Include timestamp in output (default: true)
   * @param {boolean} options.writeToFile - Also write logs to files (default: true)
   * @param {string} options.logDirectory - Directory for log files (default: './logs')
   * @param {boolean} options.silent - Silent mode for testing (default: false)
   */
  constructor(options = {}) {
    super();

    const {
      level = 'info',
      colorize = true,
      includeTimestamp = true,
      writeToFile = true,
      logDirectory = './logs',
      silent = false
    } = options;

    // Define log levels
    const levels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4
    };

    // Define colors for console output
    const colors = {
      error: 'red',
      warn: 'yellow',
      info: 'green',
      http: 'magenta',
      debug: 'blue'
    };

    winston.addColors(colors);

    // Build console format
    const consoleFormatElements = [];

    if (includeTimestamp) {
      consoleFormatElements.push(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
      );
    }

    if (colorize) {
      consoleFormatElements.push(winston.format.colorize({ all: true }));
    }

    consoleFormatElements.push(
      winston.format.printf((info) => {
        const { timestamp, level, message, ...meta } = info;

        let msg = includeTimestamp
          ? `${timestamp} [${level}]: ${message}`
          : `[${level}]: ${message}`;

        // Add metadata if present
        if (Object.keys(meta).length > 0) {
          // Filter out winston internals
          const cleanMeta = { ...meta };
          delete cleanMeta[Symbol.for('level')];
          delete cleanMeta[Symbol.for('message')];
          delete cleanMeta[Symbol.for('splat')];

          if (Object.keys(cleanMeta).length > 0) {
            msg += ` ${JSON.stringify(cleanMeta, null, 2)}`;
          }
        }

        return msg;
      })
    );

    const consoleFormat = winston.format.combine(...consoleFormatElements);

    // JSON format for file output
    const jsonFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    // Build transports
    const transports = [
      new winston.transports.Console({
        format: consoleFormat,
        silent
      })
    ];

    // Add file transports if enabled
    if (writeToFile && !silent) {
      transports.push(
        new winston.transports.File({
          filename: path.join(logDirectory, 'error.log'),
          level: 'error',
          format: jsonFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path.join(logDirectory, 'combined.log'),
          format: jsonFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      );
    }

    // Create Winston logger instance
    this.winstonLogger = winston.createLogger({
      level,
      levels,
      format: consoleFormat,
      transports,
      // Handle uncaught exceptions and unhandled rejections
      exceptionHandlers: writeToFile && !silent
        ? [
            new winston.transports.File({
              filename: path.join(logDirectory, 'exceptions.log'),
              format: jsonFormat
            })
          ]
        : [],
      rejectionHandlers: writeToFile && !silent
        ? [
            new winston.transports.File({
              filename: path.join(logDirectory, 'rejections.log'),
              format: jsonFormat
            })
          ]
        : []
    });
  }

  /**
   * Log an error message
   */
  error(message, metadata = {}) {
    this.winstonLogger.error(message, metadata);
  }

  /**
   * Log a warning message
   */
  warn(message, metadata = {}) {
    this.winstonLogger.warn(message, metadata);
  }

  /**
   * Log an informational message
   */
  info(message, metadata = {}) {
    this.winstonLogger.info(message, metadata);
  }

  /**
   * Log an HTTP request/response
   */
  http(message, metadata = {}) {
    this.winstonLogger.http(message, metadata);
  }

  /**
   * Log a debug message
   */
  debug(message, metadata = {}) {
    this.winstonLogger.debug(message, metadata);
  }

  /**
   * Log a message at the specified level
   */
  log(level, message, metadata = {}) {
    this.winstonLogger.log(level, message, metadata);
  }

  /**
   * Change the log level dynamically
   * @param {string} level - New log level
   */
  setLevel(level) {
    this.winstonLogger.level = level;
  }

  /**
   * Get current log level
   * @returns {string}
   */
  getLevel() {
    return this.winstonLogger.level;
  }

  /**
   * Enable silent mode (for testing)
   */
  silence() {
    this.winstonLogger.transports.forEach(transport => {
      transport.silent = true;
    });
  }

  /**
   * Disable silent mode
   */
  unsilence() {
    this.winstonLogger.transports.forEach(transport => {
      transport.silent = false;
    });
  }
}

module.exports = ConsoleLogger;
