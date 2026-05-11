/**
 * Parse a number string that may use Argentine notation ('.' thousands, ',' decimal)
 * or plain JSON-style notation ('.' decimal, no thousand separators).
 * Examples: "1.234,56" -> 1234.56;  "1234.56" -> 1234.56;  "150" -> 150
 * @param {string} s
 * @returns {number}
 */
function parseArNumber(s) {
  if (s === null || s === undefined) return NaN;
  const trimmed = String(s).trim();
  if (!trimmed) return NaN;
  if (trimmed.includes(',')) {
    return parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(trimmed);
}

module.exports = { parseArNumber };
