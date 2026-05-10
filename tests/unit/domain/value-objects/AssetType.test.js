/**
 * AssetType Value Object Tests
 */

const AssetType = require('../../../../src/domain/value-objects/AssetType');
const { ValidationError } = require('../../../../src/shared/errors');

describe('AssetType Value Object', () => {
  describe('constants', () => {
    it('should have all asset type constants defined', () => {
      expect(AssetType.STOCK).toBe('stock');
      expect(AssetType.ETF).toBe('etf');
      expect(AssetType.CEDEAR).toBe('cedear');
      expect(AssetType.BOND).toBe('bond');
      expect(AssetType.BOPREAL).toBe('bopreal');
      expect(AssetType.LECAP).toBe('lecap');
      expect(AssetType.ON).toBe('on');
      expect(AssetType.DEPOSIT).toBe('deposit');
      expect(AssetType.CASH).toBe('cash');
    });
  });

  describe('AssetType.values', () => {
    it('should return array of all valid asset types', () => {
      const values = AssetType.values();
      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBe(9);
      expect(values).toContain('stock');
      expect(values).toContain('etf');
      expect(values).toContain('cedear');
      expect(values).toContain('bond');
      expect(values).toContain('bopreal');
      expect(values).toContain('lecap');
      expect(values).toContain('on');
      expect(values).toContain('deposit');
      expect(values).toContain('cash');
    });
  });

  describe('AssetType.isValid', () => {
    it('should return true for valid asset types', () => {
      expect(AssetType.isValid('stock')).toBe(true);
      expect(AssetType.isValid('etf')).toBe(true);
      expect(AssetType.isValid('cedear')).toBe(true);
      expect(AssetType.isValid('bond')).toBe(true);
      expect(AssetType.isValid('bopreal')).toBe(true);
      expect(AssetType.isValid('lecap')).toBe(true);
      expect(AssetType.isValid('on')).toBe(true);
      expect(AssetType.isValid('deposit')).toBe(true);
      expect(AssetType.isValid('cash')).toBe(true);
    });

    it('should return false for invalid asset types', () => {
      expect(AssetType.isValid('invalid')).toBe(false);
      expect(AssetType.isValid('STOCK')).toBe(false);
      expect(AssetType.isValid('')).toBe(false);
      expect(AssetType.isValid(null)).toBe(false);
    });
  });

  describe('AssetType.assertValid', () => {
    it('should not throw for valid asset types', () => {
      expect(() => AssetType.assertValid('stock')).not.toThrow();
      expect(() => AssetType.assertValid('etf')).not.toThrow();
      expect(() => AssetType.assertValid('cash')).not.toThrow();
    });

    it('should throw ValidationError for invalid asset types', () => {
      expect(() => AssetType.assertValid('invalid')).toThrow(ValidationError);
      expect(() => AssetType.assertValid('STOCK')).toThrow(ValidationError);
      expect(() => AssetType.assertValid(null)).toThrow(ValidationError);
    });
  });

  describe('AssetType.requiresPriceQuote', () => {
    it('should return true for assets requiring price quotes', () => {
      expect(AssetType.requiresPriceQuote('stock')).toBe(true);
      expect(AssetType.requiresPriceQuote('etf')).toBe(true);
      expect(AssetType.requiresPriceQuote('cedear')).toBe(true);
      expect(AssetType.requiresPriceQuote('bond')).toBe(true);
      expect(AssetType.requiresPriceQuote('bopreal')).toBe(true);
      expect(AssetType.requiresPriceQuote('lecap')).toBe(true);
      expect(AssetType.requiresPriceQuote('on')).toBe(true);
    });

    it('should return false for assets not requiring price quotes', () => {
      expect(AssetType.requiresPriceQuote('deposit')).toBe(false);
      expect(AssetType.requiresPriceQuote('cash')).toBe(false);
    });

    it('should return false for invalid asset types', () => {
      expect(AssetType.requiresPriceQuote('invalid')).toBe(false);
      expect(AssetType.requiresPriceQuote(null)).toBe(false);
    });
  });
});
