/**
 * Quantity Value Object Tests
 */

const Quantity = require('../../../../src/domain/value-objects/Quantity');
const { ValidationError } = require('../../../../src/shared/errors');

describe('Quantity Value Object', () => {
  describe('constructor', () => {
    it('should create valid quantities', () => {
      const qty1 = new Quantity(100);
      expect(qty1.value).toBe(100);

      const qty2 = new Quantity(0);
      expect(qty2.value).toBe(0);

      const qty3 = new Quantity(10.5);
      expect(qty3.value).toBe(10.5);

      const qty4 = new Quantity('100');
      expect(qty4.value).toBe(100);
    });

    it('should allow zero', () => {
      const qty = new Quantity(0);
      expect(qty.value).toBe(0);
      expect(qty.isZero()).toBe(true);
    });

    it('should allow decimals (for fractional positions)', () => {
      const qty = new Quantity(10.25);
      expect(qty.value).toBe(10.25);
    });

    it('should reject negative quantities', () => {
      expect(() => new Quantity(-1)).toThrow(ValidationError);
      expect(() => new Quantity('-10')).toThrow(ValidationError);
    });

    it('should reject NaN', () => {
      expect(() => new Quantity(NaN)).toThrow(ValidationError);
    });

    it('should reject non-numeric types', () => {
      expect(() => new Quantity('not a number')).toThrow(ValidationError);
      expect(() => new Quantity(null)).toThrow(ValidationError);
      expect(() => new Quantity(undefined)).toThrow(ValidationError);
      expect(() => new Quantity({})).toThrow(ValidationError);
    });

    it('should reject infinite numbers', () => {
      expect(() => new Quantity(Infinity)).toThrow(ValidationError);
      expect(() => new Quantity(-Infinity)).toThrow(ValidationError);
    });
  });

  describe('isZero', () => {
    it('should return true for zero quantity', () => {
      const qty = new Quantity(0);
      expect(qty.isZero()).toBe(true);
    });

    it('should return false for non-zero quantity', () => {
      const qty = new Quantity(10);
      expect(qty.isZero()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal quantities', () => {
      const qty1 = new Quantity(100);
      const qty2 = new Quantity(100);
      expect(qty1.equals(qty2)).toBe(true);
    });

    it('should return false for different quantities', () => {
      const qty1 = new Quantity(100);
      const qty2 = new Quantity(50);
      expect(qty1.equals(qty2)).toBe(false);
    });

    it('should return false when comparing with non-Quantity', () => {
      const qty = new Quantity(100);
      expect(qty.equals(100)).toBe(false);
      expect(qty.equals('100')).toBe(false);
      expect(qty.equals(null)).toBe(false);
    });

    it('should handle decimal comparison', () => {
      const qty1 = new Quantity(10.5);
      const qty2 = new Quantity(10.5);
      expect(qty1.equals(qty2)).toBe(true);
    });
  });

  describe('add', () => {
    it('should add two quantities', () => {
      const qty1 = new Quantity(100);
      const qty2 = new Quantity(50);
      const result = qty1.add(qty2);
      expect(result.value).toBe(150);
    });

    it('should return new Quantity instance', () => {
      const qty1 = new Quantity(100);
      const qty2 = new Quantity(50);
      const result = qty1.add(qty2);
      expect(result instanceof Quantity).toBe(true);
      expect(result).not.toBe(qty1);
    });

    it('should handle decimals', () => {
      const qty1 = new Quantity(10.5);
      const qty2 = new Quantity(5.25);
      const result = qty1.add(qty2);
      expect(result.value).toBeCloseTo(15.75);
    });

    it('should reject non-Quantity operand', () => {
      const qty = new Quantity(100);
      expect(() => qty.add(50)).toThrow(TypeError);
    });
  });

  describe('subtract', () => {
    it('should subtract two quantities', () => {
      const qty1 = new Quantity(100);
      const qty2 = new Quantity(30);
      const result = qty1.subtract(qty2);
      expect(result.value).toBe(70);
    });

    it('should return new Quantity instance', () => {
      const qty1 = new Quantity(100);
      const qty2 = new Quantity(30);
      const result = qty1.subtract(qty2);
      expect(result instanceof Quantity).toBe(true);
      expect(result).not.toBe(qty1);
    });

    it('should reject subtraction resulting in negative', () => {
      const qty1 = new Quantity(30);
      const qty2 = new Quantity(100);
      expect(() => qty1.subtract(qty2)).toThrow(ValidationError);
    });

    it('should allow subtraction to zero', () => {
      const qty1 = new Quantity(100);
      const qty2 = new Quantity(100);
      const result = qty1.subtract(qty2);
      expect(result.value).toBe(0);
    });

    it('should reject non-Quantity operand', () => {
      const qty = new Quantity(100);
      expect(() => qty.subtract(30)).toThrow(TypeError);
    });
  });

  describe('toString', () => {
    it('should return the value as string', () => {
      const qty = new Quantity(100);
      expect(qty.toString()).toBe('100');
    });

    it('should handle decimals', () => {
      const qty = new Quantity(10.5);
      expect(qty.toString()).toMatch(/10\.5/);
    });
  });

  describe('toJSON', () => {
    it('should return the numeric value', () => {
      const qty = new Quantity(100);
      expect(qty.toJSON()).toBe(100);
    });
  });

  describe('Quantity.of factory', () => {
    it('should create Quantity from number', () => {
      const qty = Quantity.of(100);
      expect(qty.value).toBe(100);
    });
  });

  describe('Quantity.zero factory', () => {
    it('should create zero Quantity', () => {
      const qty = Quantity.zero();
      expect(qty.value).toBe(0);
      expect(qty.isZero()).toBe(true);
    });
  });

  describe('Quantity.fromJSON factory', () => {
    it('should create Quantity from JSON number', () => {
      const qty = Quantity.fromJSON(100);
      expect(qty.value).toBe(100);
    });

    it('should reject non-numeric JSON', () => {
      expect(() => Quantity.fromJSON('100')).toThrow(ValidationError);
      expect(() => Quantity.fromJSON(null)).toThrow(ValidationError);
    });
  });

  describe('Quantity.isValid', () => {
    it('should return true for valid quantities', () => {
      expect(Quantity.isValid(100)).toBe(true);
      expect(Quantity.isValid(0)).toBe(true);
      expect(Quantity.isValid(10.5)).toBe(true);
      expect(Quantity.isValid('100')).toBe(true);
    });

    it('should return false for invalid quantities', () => {
      expect(Quantity.isValid(-1)).toBe(false);
      expect(Quantity.isValid(NaN)).toBe(false);
      expect(Quantity.isValid(Infinity)).toBe(false);
      expect(Quantity.isValid('not a number')).toBe(false);
      expect(Quantity.isValid(null)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const qty = new Quantity(100);
      qty.value = 50; // Try to modify
      expect(qty.value).toBe(100); // Should still be original
    });
  });
});
