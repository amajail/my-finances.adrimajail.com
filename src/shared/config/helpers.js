/**
 * Configuration Helper Functions
 *
 * Utility functions for parsing and validating environment variables
 */

/**
 * Get optional environment variable with fallback
 * @param {string} key - Environment variable name
 * @param {string} defaultValue - Default value if not set
 * @returns {string}
 */
function get(key, defaultValue = '') {
  return process.env[key] || defaultValue;
}

/**
 * Get required environment variable or throw error
 * @param {string} key - Environment variable name
 * @returns {string}
 * @throws {Error} If environment variable is not set
 */
function getRequired(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Parse integer from environment variable with fallback
 * @param {string} key - Environment variable name
 * @param {number} defaultValue - Default value if not set or invalid
 * @returns {number}
 */
function getInt(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float from environment variable with fallback
 * @param {string} key - Environment variable name
 * @param {number} defaultValue - Default value if not set or invalid
 * @returns {number}
 */
function getFloat(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from environment variable with fallback
 * Recognizes: 'true', '1', 'yes', 'on' as true (case insensitive)
 * @param {string} key - Environment variable name
 * @param {boolean} defaultValue - Default value if not set
 * @returns {boolean}
 */
function getBoolean(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;

  const normalized = value.toLowerCase().trim();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;

  return defaultValue;
}

/**
 * Parse JSON from environment variable with fallback
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value if not set or invalid JSON
 * @returns {*}
 */
function getJSON(key, defaultValue = null) {
  const value = process.env[key];
  if (!value) return defaultValue;

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(`Failed to parse JSON for ${key}: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Get array from comma-separated environment variable
 * @param {string} key - Environment variable name
 * @param {Array} defaultValue - Default value if not set
 * @returns {Array<string>}
 */
function getArray(key, defaultValue = []) {
  const value = process.env[key];
  if (!value) return defaultValue;

  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Validate that all required environment variables are set
 * @param {Array<string>} keys - Array of required environment variable names
 * @throws {Error} If any required variable is missing
 */
function validateRequired(keys) {
  const missing = keys.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

module.exports = {
  get,
  getRequired,
  getInt,
  getFloat,
  getBoolean,
  getJSON,
  getArray,
  validateRequired
};
