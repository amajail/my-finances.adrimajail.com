/**
 * AssetType Value Object
 *
 * Represents the type of asset in a portfolio.
 * Enum-like value object with static constants.
 */

const { ValidationError } = require('../../shared/errors');

class AssetType {
  // Static constants for asset types
  static STOCK = 'stock';
  static ETF = 'etf';
  static CEDEAR = 'cedear';
  static BOND = 'bond';
  static BOPREAL = 'bopreal';
  static LECAP = 'lecap';
  static ON = 'on';
  static DEPOSIT = 'deposit';
  static CASH = 'cash';

  /**
   * Get all valid asset type values
   * @returns {string[]}
   */
  static values() {
    return [
      AssetType.STOCK,
      AssetType.ETF,
      AssetType.CEDEAR,
      AssetType.BOND,
      AssetType.BOPREAL,
      AssetType.LECAP,
      AssetType.ON,
      AssetType.DEPOSIT,
      AssetType.CASH
    ];
  }

  /**
   * Check if a value is a valid asset type
   * @param {string} value - Value to check
   * @returns {boolean}
   */
  static isValid(value) {
    return AssetType.values().includes(value);
  }

  /**
   * Assert that a value is valid, throw if not
   * @param {string} value - Value to validate
   * @throws {ValidationError} If value is not valid
   */
  static assertValid(value) {
    if (!AssetType.isValid(value)) {
      throw ValidationError.forField(
        'assetType',
        `Invalid asset type: ${value}. Must be one of: ${AssetType.values().join(', ')}`
      );
    }
  }

  /**
   * Determine if an asset type requires a price quote
   * Returns true for assets that need market price updates (stocks, etfs, etc.)
   * Returns false for assets that don't have fluctuating prices (deposits, cash)
   * @param {string} type - Asset type to check
   * @returns {boolean}
   */
  static requiresPriceQuote(type) {
    // Assets that require price quotes
    const priceQuoteAssets = [
      AssetType.STOCK,
      AssetType.ETF,
      AssetType.CEDEAR,
      AssetType.BOND,
      AssetType.BOPREAL,
      AssetType.LECAP,
      AssetType.ON
    ];
    return priceQuoteAssets.includes(type);
  }

  /**
   * Face value the price is quoted against.
   * Bonds, BOPREAL, LECAP and ON are quoted per 100 nominales (% of par),
   * so position value = quantity * (price / 100). Other types quote per unit.
   * @param {string} type - Asset type
   * @returns {number} 100 for per-par-quoted instruments, 1 otherwise
   */
  static priceFaceValue(type) {
    const quotedPerHundred = [
      AssetType.BOND,
      AssetType.BOPREAL,
      AssetType.LECAP,
      AssetType.ON
    ];
    return quotedPerHundred.includes(type) ? 100 : 1;
  }
}

module.exports = AssetType;
