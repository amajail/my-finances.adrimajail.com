/**
 * Date Utility Functions
 *
 * Provides date manipulation and formatting utilities.
 */

/**
 * Format date to YYYY-MM-DD string
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatToYYYYMMDD(date) {
  const dateObj = date instanceof Date ? date : new Date(date);

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Format date to DD/MM/YYYY string
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatToDDMMYYYY(date) {
  const dateObj = date instanceof Date ? date : new Date(date);

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Get current date at midnight (start of day)
 * @returns {Date}
 */
function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Get date N days ago
 * @param {number} days - Number of days to subtract
 * @returns {Date}
 */
function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get date N days from now
 * @param {number} days - Number of days to add
 * @returns {Date}
 */
function getDaysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get the first day of current month
 * @returns {Date}
 */
function getStartOfCurrentMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get the last day of current month
 * @returns {Date}
 */
function getEndOfCurrentMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Get the first day of a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Date}
 */
function getStartOfMonth(year, month) {
  const date = new Date(year, month - 1, 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get the last day of a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Date}
 */
function getEndOfMonth(year, month) {
  const date = new Date(year, month, 0);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Calculate difference in days between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} Number of days (positive if date1 > date2)
 */
function getDaysDifference(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);

  // Remove time component for accurate day calculation
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  const diffTime = d1 - d2;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if date is today
 * @param {Date|string} date - Date to check
 * @returns {boolean}
 */
function isToday(date) {
  const dateObj = date instanceof Date ? date : new Date(date);
  const today = new Date();

  return dateObj.getDate() === today.getDate() &&
         dateObj.getMonth() === today.getMonth() &&
         dateObj.getFullYear() === today.getFullYear();
}

/**
 * Check if date is in the past
 * @param {Date|string} date - Date to check
 * @returns {boolean}
 */
function isPast(date) {
  const dateObj = date instanceof Date ? date : new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dateObj.setHours(0, 0, 0, 0);

  return dateObj < today;
}

/**
 * Check if date is in the future
 * @param {Date|string} date - Date to check
 * @returns {boolean}
 */
function isFuture(date) {
  const dateObj = date instanceof Date ? date : new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dateObj.setHours(0, 0, 0, 0);

  return dateObj > today;
}

/**
 * Parse date string in various formats
 * Supports: YYYY-MM-DD, DD/MM/YYYY, YYYYMMDD
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }

  // Try DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, parseInt(month) - 1, day);
  }

  // Try YYYYMMDD format
  if (/^\d{8}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return new Date(year, parseInt(month) - 1, day);
  }

  // Try generic Date parsing as fallback
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Convert timestamp (milliseconds) to Date
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {Date}
 */
function fromTimestamp(timestamp) {
  return new Date(timestamp);
}

/**
 * Convert date to timestamp (milliseconds)
 * @param {Date|string} date - Date to convert
 * @returns {number}
 */
function toTimestamp(date) {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.getTime();
}

/**
 * Add months to a date
 * @param {Date|string} date - Starting date
 * @param {number} months - Number of months to add
 * @returns {Date}
 */
function addMonths(date, months) {
  const dateObj = date instanceof Date ? new Date(date) : new Date(date);
  dateObj.setMonth(dateObj.getMonth() + months);
  return dateObj;
}

/**
 * Get month name in Spanish
 * @param {number} month - Month number (1-12)
 * @returns {string}
 */
function getMonthName(month) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1] || '';
}

module.exports = {
  formatToYYYYMMDD,
  formatToDDMMYYYY,
  getToday,
  getDaysAgo,
  getDaysFromNow,
  getStartOfCurrentMonth,
  getEndOfCurrentMonth,
  getStartOfMonth,
  getEndOfMonth,
  getDaysDifference,
  isToday,
  isPast,
  isFuture,
  parseDate,
  fromTimestamp,
  toTimestamp,
  addMonths,
  getMonthName
};
