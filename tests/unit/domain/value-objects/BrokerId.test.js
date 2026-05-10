/**
 * BrokerId Value Object Tests
 */

const BrokerId = require('../../../../src/domain/value-objects/BrokerId');
const { ValidationError } = require('../../../../src/shared/errors');

describe('BrokerId Value Object', () => {
  describe('constructor', () => {
    it('should create valid broker IDs', () => {
      const id1 = new BrokerId('galicia');
      expect(id1.value).toBe('galicia');

      const id2 = new BrokerId('iol');
      expect(id2.value).toBe('iol');

      const id3 = new BrokerId('ibkr');
      expect(id3.value).toBe('ibkr');

      const id4 = new BrokerId('cash');
      expect(id4.value).toBe('cash');
    });

    it('should normalize to lowercase', () => {
      const id = new BrokerId('GALICIA');
      expect(id.value).toBe('galicia');
    });

    it('should accept underscores and hyphens', () => {
      const id1 = new BrokerId('galicia_usd');
      expect(id1.value).toBe('galicia_usd');

      const id2 = new BrokerId('my-broker');
      expect(id2.value).toBe('my-broker');
    });

    it('should trim whitespace', () => {
      const id = new BrokerId('  galicia  ');
      expect(id.value).toBe('galicia');
    });

    it('should reject empty broker IDs', () => {
      expect(() => new BrokerId('')).toThrow(ValidationError);
      expect(() => new BrokerId('  ')).toThrow(ValidationError);
      expect(() => new BrokerId(null)).toThrow(ValidationError);
      expect(() => new BrokerId(undefined)).toThrow(ValidationError);
    });

    it('should normalize uppercase to lowercase', () => {
      const id = new BrokerId('GALICIA');
      expect(id.value).toBe('galicia');
      // (normalized to lowercase, so this actually passes)
    });

    it('should reject invalid characters', () => {
      expect(() => new BrokerId('galicia.usd')).toThrow(ValidationError);
      expect(() => new BrokerId('galicia$')).toThrow(ValidationError);
      expect(() => new BrokerId('galicia usd')).toThrow(ValidationError);
    });
  });

  describe('equals', () => {
    it('should return true for equal broker IDs', () => {
      const id1 = new BrokerId('galicia');
      const id2 = new BrokerId('galicia');
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different broker IDs', () => {
      const id1 = new BrokerId('galicia');
      const id2 = new BrokerId('iol');
      expect(id1.equals(id2)).toBe(false);
    });

    it('should return false when comparing with non-BrokerId', () => {
      const id = new BrokerId('galicia');
      expect(id.equals('galicia')).toBe(false);
      expect(id.equals(null)).toBe(false);
      expect(id.equals({})).toBe(false);
    });

    it('should be case insensitive in equality', () => {
      const id1 = new BrokerId('GALICIA');
      const id2 = new BrokerId('galicia');
      expect(id1.equals(id2)).toBe(true);
    });
  });

  describe('toString', () => {
    it('should return the value', () => {
      const id = new BrokerId('galicia');
      expect(id.toString()).toBe('galicia');
    });
  });

  describe('toJSON', () => {
    it('should return the value as string', () => {
      const id = new BrokerId('galicia');
      expect(id.toJSON()).toBe('galicia');
    });
  });

  describe('BrokerId.of factory', () => {
    it('should create BrokerId from string', () => {
      const id = BrokerId.of('galicia');
      expect(id.value).toBe('galicia');
    });
  });

  describe('BrokerId.fromJSON factory', () => {
    it('should create BrokerId from string', () => {
      const id = BrokerId.fromJSON('galicia');
      expect(id.value).toBe('galicia');
    });

    it('should create BrokerId from object with value property', () => {
      const id = BrokerId.fromJSON({ value: 'galicia' });
      expect(id.value).toBe('galicia');
    });

    it('should reject invalid JSON', () => {
      expect(() => BrokerId.fromJSON(null)).toThrow(ValidationError);
      expect(() => BrokerId.fromJSON(123)).toThrow(ValidationError);
      expect(() => BrokerId.fromJSON({})).toThrow(ValidationError);
    });
  });

  describe('BrokerId.isValid', () => {
    it('should return true for valid broker IDs', () => {
      expect(BrokerId.isValid('galicia')).toBe(true);
      expect(BrokerId.isValid('iol')).toBe(true);
      expect(BrokerId.isValid('galicia_usd')).toBe(true);
      expect(BrokerId.isValid('my-broker')).toBe(true);
    });

    it('should return false for invalid broker IDs', () => {
      expect(BrokerId.isValid('')).toBe(false);
      expect(BrokerId.isValid('galicia.usd')).toBe(false);
      expect(BrokerId.isValid(null)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const id = new BrokerId('galicia');
      id.value = 'iol'; // Try to modify
      expect(id.value).toBe('galicia'); // Should still be original
    });
  });
});
