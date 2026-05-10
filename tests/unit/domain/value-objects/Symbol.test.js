/**
 * Symbol Value Object Tests
 */

const Symbol = require('../../../../src/domain/value-objects/Symbol');
const { ValidationError } = require('../../../../src/shared/errors');

describe('Symbol Value Object', () => {
  describe('constructor', () => {
    it('should create valid symbols', () => {
      const symbol1 = new Symbol('AAPL');
      expect(symbol1.value).toBe('AAPL');

      const symbol2 = new Symbol('BRK.B');
      expect(symbol2.value).toBe('BRK.B');

      const symbol3 = new Symbol('BOND01');
      expect(symbol3.value).toBe('BOND01');

      const symbol4 = new Symbol('BOND02');
      expect(symbol4.value).toBe('BOND02');

      const symbol5 = new Symbol('USD');
      expect(symbol5.value).toBe('USD');
    });

    it('should normalize to uppercase', () => {
      const symbol = new Symbol('aapl');
      expect(symbol.value).toBe('AAPL');
    });

    it('should trim whitespace', () => {
      const symbol = new Symbol('  AAPL  ');
      expect(symbol.value).toBe('AAPL');
    });

    it('should reject empty symbols', () => {
      expect(() => new Symbol('')).toThrow(ValidationError);
      expect(() => new Symbol('  ')).toThrow(ValidationError);
      expect(() => new Symbol(null)).toThrow(ValidationError);
      expect(() => new Symbol(undefined)).toThrow(ValidationError);
    });

    it('should reject invalid characters', () => {
      expect(() => new Symbol('AAPL$')).toThrow(ValidationError);
      expect(() => new Symbol('AA@PL')).toThrow(ValidationError);
      expect(() => new Symbol('AA PL')).toThrow(ValidationError);
    });

    it('should accept alphanumeric and allowed special chars', () => {
      const symbol1 = new Symbol('BRK.B');
      expect(symbol1.value).toBe('BRK.B');

      const symbol2 = new Symbol('BOND01');
      expect(symbol2.value).toBe('BOND01');

      const symbol3 = new Symbol('TEST-1');
      expect(symbol3.value).toBe('TEST-1');

      const symbol4 = new Symbol('TEST_1');
      expect(symbol4.value).toBe('TEST_1');
    });
  });

  describe('equals', () => {
    it('should return true for equal symbols', () => {
      const symbol1 = new Symbol('AAPL');
      const symbol2 = new Symbol('AAPL');
      expect(symbol1.equals(symbol2)).toBe(true);
    });

    it('should return false for different symbols', () => {
      const symbol1 = new Symbol('AAPL');
      const symbol2 = new Symbol('GOOGL');
      expect(symbol1.equals(symbol2)).toBe(false);
    });

    it('should return false when comparing with non-Symbol', () => {
      const symbol = new Symbol('AAPL');
      expect(symbol.equals('AAPL')).toBe(false);
      expect(symbol.equals(null)).toBe(false);
      expect(symbol.equals({})).toBe(false);
    });

    it('should be case insensitive in equality', () => {
      const symbol1 = new Symbol('aapl');
      const symbol2 = new Symbol('AAPL');
      expect(symbol1.equals(symbol2)).toBe(true);
    });
  });

  describe('toString', () => {
    it('should return the value', () => {
      const symbol = new Symbol('AAPL');
      expect(symbol.toString()).toBe('AAPL');
    });
  });

  describe('toJSON', () => {
    it('should return the value as string', () => {
      const symbol = new Symbol('AAPL');
      expect(symbol.toJSON()).toBe('AAPL');
    });
  });

  describe('Symbol.of factory', () => {
    it('should create Symbol from string', () => {
      const symbol = Symbol.of('AAPL');
      expect(symbol.value).toBe('AAPL');
    });

    it('should work like constructor', () => {
      const s1 = new Symbol('AAPL');
      const s2 = Symbol.of('AAPL');
      expect(s1.equals(s2)).toBe(true);
    });
  });

  describe('Symbol.fromJSON factory', () => {
    it('should create Symbol from string', () => {
      const symbol = Symbol.fromJSON('AAPL');
      expect(symbol.value).toBe('AAPL');
    });

    it('should create Symbol from object with value property', () => {
      const symbol = Symbol.fromJSON({ value: 'AAPL' });
      expect(symbol.value).toBe('AAPL');
    });

    it('should reject invalid JSON', () => {
      expect(() => Symbol.fromJSON(null)).toThrow(ValidationError);
      expect(() => Symbol.fromJSON(123)).toThrow(ValidationError);
      expect(() => Symbol.fromJSON({})).toThrow(ValidationError);
    });
  });

  describe('Symbol.isValid', () => {
    it('should return true for valid symbols', () => {
      expect(Symbol.isValid('AAPL')).toBe(true);
      expect(Symbol.isValid('BRK.B')).toBe(true);
      expect(Symbol.isValid('BOND01')).toBe(true);
    });

    it('should return false for invalid symbols', () => {
      expect(Symbol.isValid('')).toBe(false);
      expect(Symbol.isValid('AAPL$')).toBe(false);
      expect(Symbol.isValid(null)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const symbol = new Symbol('AAPL');
      symbol.value = 'GOOGL'; // Try to modify
      expect(symbol.value).toBe('AAPL'); // Should still be original
    });
  });
});
