/**
 * Shared Utilities Module
 *
 * Central exports for all shared utility functions.
 */

const dateUtils = require('./date.utils');
const formatUtils = require('./format.utils');
const currencyUtils = require('./currency.utils');

module.exports = {
  // Date utilities
  ...dateUtils,

  // Format utilities
  ...formatUtils,

  // Currency utilities
  ...currencyUtils,

  // Also export namespaced for clarity
  date: dateUtils,
  format: formatUtils,
  currency: currencyUtils
};
