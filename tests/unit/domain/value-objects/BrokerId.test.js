/**
 * BrokerId Value Object Tests
 */

const BrokerId = require('../../../../src/domain/value-objects/BrokerId');
const { ValidationError } = require('../../../../src/shared/errors');

describe('BrokerId Value Object', () => {
  describe('constructor', () => {
    it('should create valid broker IDs', () => {
      const id1 = new BrokerId('broker1');
      expect(id1.value).toBe('broker1');

      const id2 = new BrokerId('broker2');
      expect(id2.value).toBe('broker2');

      const id3 = new BrokerId('broker3');
      expect(id3.value).toBe('broker3');

      const id4 = new BrokerId('cash');
      expect(id4.value).toBe('cash');
    });

    it('should normalize to lowercase', () => {
      const id = new BrokerId('BROKER1');
      expect(id.value).toBe('broker1');
    });

    it('should accept underscores and hyphens', () => {
      const id1 = new BrokerId('broker1_usd');
      expect(id1.value).toBe('broker1_usd');

      const id2 = new BrokerId('my-broker');
      expect(id2.value).toBe('my-broker');
    });

    it('should trim whitespace', () => {
      const id = new BrokerId('  broker1  ');
      expect(id.value).toBe('broker1');
    });

    it('should reject empty broker IDs', () => {
      expect(() => new BrokerId('')).toThrow(ValidationError);
      expect(() => new BrokerId('  ')).toThrow(ValidationError);
      expect(() => new BrokerId(null)).toThrow(ValidationError);
      expect(() => new BrokerId(undefined)).toThrow(ValidationError);
    });

    it('should normalize uppercase to lowercase', () => {
      const id = new BrokerId('BROKER1');
      expect(id.value).toBe('broker1');
      // (normalized to lowercase, so this actually passes)
    });

    it('should reject invalid characters', () => {
      expect(() => new BrokerId('broker1.usd')).toThrow(ValidationError);
      expect(() => new BrokerId('broker1$')).toThrow(ValidationError);
      expect(() => new BrokerId('broker1 usd')).toThrow(ValidationError);
    });
  });

  describe('equals', () => {
    it('should return true for equal broker IDs', () => {
      const id1 = new BrokerId('broker1');
      const id2 = new BrokerId('broker1');
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different broker IDs', () => {
      const id1 = new BrokerId('broker1');
      const id2 = new BrokerId('broker2');
      expect(id1.equals(id2)).toBe(false);
    });

    it('should return false when comparing with non-BrokerId', () => {
      const id = new BrokerId('broker1');
      expect(id.equals('broker1')).toBe(false);
      expect(id.equals(null)).toBe(false);
      expect(id.equals({})).toBe(false);
    });

    it('should be case insensitive in equality', () => {
      const id1 = new BrokerId('BROKER1');
      const id2 = new BrokerId('broker1');
      expect(id1.equals(id2)).toBe(true);
    });
  });

  describe('toString', () => {
    it('should return the value', () => {
      const id = new BrokerId('broker1');
      expect(id.toString()).toBe('broker1');
    });
  });

  describe('toJSON', () => {
    it('should return the value as string', () => {
      const id = new BrokerId('broker1');
      expect(id.toJSON()).toBe('broker1');
    });
  });

  describe('BrokerId.of factory', () => {
    it('should create BrokerId from string', () => {
      const id = BrokerId.of('broker1');
      expect(id.value).toBe('broker1');
    });
  });

  describe('BrokerId.fromJSON factory', () => {
    it('should create BrokerId from string', () => {
      const id = BrokerId.fromJSON('broker1');
      expect(id.value).toBe('broker1');
    });

    it('should create BrokerId from object with value property', () => {
      const id = BrokerId.fromJSON({ value: 'broker1' });
      expect(id.value).toBe('broker1');
    });

    it('should reject invalid JSON', () => {
      expect(() => BrokerId.fromJSON(null)).toThrow(ValidationError);
      expect(() => BrokerId.fromJSON(123)).toThrow(ValidationError);
      expect(() => BrokerId.fromJSON({})).toThrow(ValidationError);
    });
  });

  describe('BrokerId.isValid', () => {
    it('should return true for valid broker IDs', () => {
      expect(BrokerId.isValid('broker1')).toBe(true);
      expect(BrokerId.isValid('broker2')).toBe(true);
      expect(BrokerId.isValid('broker1_usd')).toBe(true);
      expect(BrokerId.isValid('my-broker')).toBe(true);
    });

    it('should return false for invalid broker IDs', () => {
      expect(BrokerId.isValid('')).toBe(false);
      expect(BrokerId.isValid('broker1.usd')).toBe(false);
      expect(BrokerId.isValid(null)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const id = new BrokerId('broker1');
      id.value = 'broker2'; // Try to modify
      expect(id.value).toBe('broker1'); // Should still be original
    });
  });
});
