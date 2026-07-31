/**
 * Formatting Utility Functions
 *
 * Provides formatting utilities for display, logging, and output.
 *
 * Money-related formatting (currency, numbers, percentages, symbols) comes
 * from @amajail/money — the family's single es-AR implementation (dev-kit
 * packages/money, family roadmap Slice E). Only the non-money helpers are
 * implemented here.
 */

const {
  formatCurrency,
  formatNumber,
  formatPercentage,
  getCurrencySymbol,
} = require('@amajail/money');

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "1.5 MB")
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} ellipsis - Ellipsis string (default: '...')
 * @returns {string} Truncated text
 */
function truncate(text, maxLength, ellipsis = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Pad string to specified length
 * @param {string} str - String to pad
 * @param {number} length - Target length
 * @param {string} padChar - Character to pad with (default: ' ')
 * @param {boolean} padLeft - Pad on left side (default: false)
 * @returns {string} Padded string
 */
function padString(str, length, padChar = ' ', padLeft = false) {
  const strLen = str.length;
  if (strLen >= length) return str;

  const padding = padChar.repeat(length - strLen);
  return padLeft ? padding + str : str + padding;
}

/**
 * Format status with indicator
 * @param {string} status - Status text
 * @returns {string} Formatted status
 */
function formatStatus(status) {
  const statusMap = {
    'success': '✓',
    'failed': '✗',
    'pending': '○',
    'processing': '◐',
    'error': '✗',
    'warning': '⚠'
  };

  const indicator = statusMap[status.toLowerCase()] || '•';
  return `${indicator} ${status}`;
}

/**
 * Format duration in milliseconds to human-readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert camelCase or PascalCase to Title Case
 * @param {string} str - String to convert
 * @returns {string} Title case string
 */
function toTitleCase(str) {
  if (!str) return '';

  // Split on capital letters or underscores
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
}

module.exports = {
  formatCurrency,
  formatNumber,
  formatPercentage,
  formatFileSize,
  truncate,
  padString,
  getCurrencySymbol,
  formatStatus,
  formatDuration,
  capitalize,
  toTitleCase
};
