/**
 * Currency Utility Functions
 *
 * Provides currency conversion, calculation, and validation utilities
 * with proper precision handling for monetary values.
 */

/**
 * Round currency amount to specified decimal places
 * Uses banker's rounding (round half to even) for fairness
 * @param {number} amount - Amount to round
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number} Rounded amount
 */
function roundCurrency(amount, decimals = 2) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Amount must be a valid number');
  }

  const multiplier = Math.pow(10, decimals);
  return Math.round(amount * multiplier) / multiplier;
}

/**
 * Convert amount from one currency to another
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {number} exchangeRate - Exchange rate (toCurrency per 1 fromCurrency)
 * @returns {number} Converted amount (rounded to 2 decimals)
 */
function convertCurrency(amount, fromCurrency, toCurrency, exchangeRate) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Amount must be a valid number');
  }

  if (typeof exchangeRate !== 'number' || isNaN(exchangeRate) || exchangeRate <= 0) {
    throw new Error('Exchange rate must be a positive number');
  }

  // Normalize currency codes for comparison
  const normalizedFrom = normalizeCurrencyCode(fromCurrency);
  const normalizedTo = normalizeCurrencyCode(toCurrency);

  // Same currency, no conversion needed
  if (normalizedFrom === normalizedTo) {
    return roundCurrency(amount);
  }

  const converted = amount * exchangeRate;
  return roundCurrency(converted);
}

/**
 * Calculate VAT/IVA amount
 * @param {number} netAmount - Net amount (before VAT)
 * @param {number} vatPercentage - VAT percentage (e.g., 21 for 21%)
 * @returns {number} VAT amount (rounded to 2 decimals)
 */
function calculateVAT(netAmount, vatPercentage) {
  if (typeof netAmount !== 'number' || isNaN(netAmount)) {
    throw new Error('Net amount must be a valid number');
  }

  if (typeof vatPercentage !== 'number' || isNaN(vatPercentage) || vatPercentage < 0) {
    throw new Error('VAT percentage must be a non-negative number');
  }

  const vatAmount = netAmount * (vatPercentage / 100);
  return roundCurrency(vatAmount);
}

/**
 * Calculate total amount (net + VAT)
 * @param {number} netAmount - Net amount
 * @param {number} vatAmount - VAT amount
 * @returns {number} Total amount (rounded to 2 decimals)
 */
function calculateTotal(netAmount, vatAmount = 0) {
  if (typeof netAmount !== 'number' || isNaN(netAmount)) {
    throw new Error('Net amount must be a valid number');
  }

  if (typeof vatAmount !== 'number' || isNaN(vatAmount)) {
    throw new Error('VAT amount must be a valid number');
  }

  return roundCurrency(netAmount + vatAmount);
}

/**
 * Calculate net amount from total and VAT percentage
 * @param {number} totalAmount - Total amount (including VAT)
 * @param {number} vatPercentage - VAT percentage
 * @returns {number} Net amount (rounded to 2 decimals)
 */
function calculateNetFromTotal(totalAmount, vatPercentage) {
  if (typeof totalAmount !== 'number' || isNaN(totalAmount)) {
    throw new Error('Total amount must be a valid number');
  }

  if (typeof vatPercentage !== 'number' || isNaN(vatPercentage) || vatPercentage < 0) {
    throw new Error('VAT percentage must be a non-negative number');
  }

  // net = total / (1 + vatRate)
  const netAmount = totalAmount / (1 + vatPercentage / 100);
  return roundCurrency(netAmount);
}

/**
 * Add multiple currency amounts with proper rounding
 * @param {...number} amounts - Amounts to add
 * @returns {number} Sum (rounded to 2 decimals)
 */
function addAmounts(...amounts) {
  if (amounts.length === 0) {
    return 0;
  }

  const sum = amounts.reduce((acc, amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new Error('All amounts must be valid numbers');
    }
    return acc + amount;
  }, 0);

  return roundCurrency(sum);
}

/**
 * Subtract one amount from another with proper rounding
 * @param {number} amount1 - Amount to subtract from
 * @param {number} amount2 - Amount to subtract
 * @returns {number} Difference (rounded to 2 decimals)
 */
function subtractAmounts(amount1, amount2) {
  if (typeof amount1 !== 'number' || isNaN(amount1)) {
    throw new Error('First amount must be a valid number');
  }

  if (typeof amount2 !== 'number' || isNaN(amount2)) {
    throw new Error('Second amount must be a valid number');
  }

  return roundCurrency(amount1 - amount2);
}

/**
 * Multiply amount by a multiplier with proper rounding
 * @param {number} amount - Amount to multiply
 * @param {number} multiplier - Multiplier
 * @returns {number} Product (rounded to 2 decimals)
 */
function multiplyAmount(amount, multiplier) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Amount must be a valid number');
  }

  if (typeof multiplier !== 'number' || isNaN(multiplier)) {
    throw new Error('Multiplier must be a valid number');
  }

  return roundCurrency(amount * multiplier);
}

/**
 * Divide amount by a divisor with proper rounding
 * @param {number} amount - Amount to divide
 * @param {number} divisor - Divisor
 * @returns {number} Quotient (rounded to 2 decimals)
 */
function divideAmount(amount, divisor) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Amount must be a valid number');
  }

  if (typeof divisor !== 'number' || isNaN(divisor) || divisor === 0) {
    throw new Error('Divisor must be a non-zero number');
  }

  return roundCurrency(amount / divisor);
}

/**
 * Compare two currency amounts (handles floating point precision issues)
 * @param {number} amount1 - First amount
 * @param {number} amount2 - Second amount
 * @param {number} tolerance - Comparison tolerance (default: 0.01)
 * @returns {number} -1 if amount1 < amount2, 0 if equal, 1 if amount1 > amount2
 */
function compareCurrencyAmounts(amount1, amount2, tolerance = 0.01) {
  if (typeof amount1 !== 'number' || isNaN(amount1)) {
    throw new Error('First amount must be a valid number');
  }

  if (typeof amount2 !== 'number' || isNaN(amount2)) {
    throw new Error('Second amount must be a valid number');
  }

  const diff = amount1 - amount2;

  if (Math.abs(diff) < tolerance) {
    return 0; // Equal within tolerance
  }

  return diff > 0 ? 1 : -1;
}

/**
 * Check if two currency amounts are equal (within tolerance)
 * @param {number} amount1 - First amount
 * @param {number} amount2 - Second amount
 * @param {number} tolerance - Comparison tolerance (default: 0.01)
 * @returns {boolean}
 */
function areAmountsEqual(amount1, amount2, tolerance = 0.01) {
  return compareCurrencyAmounts(amount1, amount2, tolerance) === 0;
}

/**
 * Parse currency string to number
 * Supports formats: "$1,234.56", "1.234,56", "1234.56"
 * @param {string} currencyString - Currency string to parse
 * @returns {number|null} Parsed amount or null if invalid
 */
function parseCurrencyAmount(currencyString) {
  if (typeof currencyString !== 'string') {
    return null;
  }

  // Remove currency symbols and whitespace
  let cleaned = currencyString
    .replace(/[$€£¥R\s]/g, '')
    .trim();

  // Handle different decimal separators
  // Check if uses comma as decimal separator (European format)
  const hasCommaDecimal = /\d+,\d{2}$/.test(cleaned);

  if (hasCommaDecimal) {
    // Convert European format (1.234,56) to US format (1234.56)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Remove thousand separators (commas in US format)
    cleaned = cleaned.replace(/,/g, '');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Validate currency code
 * @param {string} currencyCode - Currency code to validate
 * @returns {boolean}
 */
function validateCurrencyCode(currencyCode) {
  const validCurrencies = [
    'PES', 'ARS',  // Argentine Peso
    'DOL', 'USD',  // US Dollar
    'EUR',         // Euro
    'BRL',         // Brazilian Real
    'GBP',         // British Pound
    'JPY',         // Japanese Yen
    'CNY'          // Chinese Yuan
  ];

  return typeof currencyCode === 'string' &&
         validCurrencies.includes(currencyCode.toUpperCase());
}

/**
 * Normalize currency code (AFIP codes to ISO codes)
 * AFIP uses: PES (Pesos), DOL (Dollars)
 * ISO uses: ARS (Pesos), USD (Dollars)
 * @param {string} currencyCode - Currency code to normalize
 * @returns {string} Normalized currency code
 */
function normalizeCurrencyCode(currencyCode) {
  if (typeof currencyCode !== 'string') {
    return currencyCode;
  }

  const mapping = {
    'PES': 'ARS',
    'DOL': 'USD'
  };

  const upperCode = currencyCode.toUpperCase();
  return mapping[upperCode] || upperCode;
}

/**
 * Convert ISO currency code to AFIP currency code
 * @param {string} isoCurrencyCode - ISO currency code (ARS, USD, EUR)
 * @returns {string} AFIP currency code
 */
function toAfipCurrencyCode(isoCurrencyCode) {
  if (typeof isoCurrencyCode !== 'string') {
    return isoCurrencyCode;
  }

  const mapping = {
    'ARS': 'PES',
    'USD': 'DOL'
  };

  const upperCode = isoCurrencyCode.toUpperCase();
  return mapping[upperCode] || upperCode;
}

/**
 * Format amount as currency with symbol
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted currency string
 */
function formatCurrencyAmount(amount, currencyCode = 'ARS') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return 'N/A';
  }

  const normalized = normalizeCurrencyCode(currencyCode);

  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: normalized,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (error) {
    // Fallback for unsupported currencies
    const symbols = {
      'ARS': '$',
      'PES': '$',
      'USD': 'US$',
      'DOL': 'US$',
      'EUR': '€',
      'BRL': 'R$'
    };

    const symbol = symbols[currencyCode.toUpperCase()] || currencyCode;
    return `${symbol} ${amount.toFixed(2)}`;
  }
}

/**
 * Calculate percentage of an amount
 * @param {number} amount - Base amount
 * @param {number} percentage - Percentage (e.g., 21 for 21%)
 * @returns {number} Calculated percentage amount (rounded to 2 decimals)
 */
function calculatePercentage(amount, percentage) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Amount must be a valid number');
  }

  if (typeof percentage !== 'number' || isNaN(percentage)) {
    throw new Error('Percentage must be a valid number');
  }

  return roundCurrency(amount * (percentage / 100));
}

/**
 * Split amount into parts according to percentages
 * @param {number} totalAmount - Total amount to split
 * @param {number[]} percentages - Array of percentages (must sum to 100)
 * @returns {number[]} Array of split amounts
 */
function splitAmount(totalAmount, percentages) {
  if (typeof totalAmount !== 'number' || isNaN(totalAmount)) {
    throw new Error('Total amount must be a valid number');
  }

  if (!Array.isArray(percentages) || percentages.length === 0) {
    throw new Error('Percentages must be a non-empty array');
  }

  const percentageSum = percentages.reduce((sum, p) => sum + p, 0);
  if (Math.abs(percentageSum - 100) > 0.01) {
    throw new Error('Percentages must sum to 100');
  }

  // Calculate each part
  const parts = percentages.map(p => calculatePercentage(totalAmount, p));

  // Adjust last part to ensure sum equals total (handle rounding errors)
  const partsSum = parts.reduce((sum, p) => sum + p, 0);
  const difference = roundCurrency(totalAmount - partsSum);

  if (Math.abs(difference) > 0.01) {
    parts[parts.length - 1] = roundCurrency(parts[parts.length - 1] + difference);
  }

  return parts;
}

module.exports = {
  roundCurrency,
  convertCurrency,
  calculateVAT,
  calculateTotal,
  calculateNetFromTotal,
  addAmounts,
  subtractAmounts,
  multiplyAmount,
  divideAmount,
  compareCurrencyAmounts,
  areAmountsEqual,
  parseCurrencyAmount,
  validateCurrencyCode,
  normalizeCurrencyCode,
  toAfipCurrencyCode,
  formatCurrencyAmount,
  calculatePercentage,
  splitAmount
};
