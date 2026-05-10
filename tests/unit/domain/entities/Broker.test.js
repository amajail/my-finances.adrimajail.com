/**
 * Broker Entity Tests
 */

const Broker = require('../../../../src/domain/entities/Broker');
const BrokerId = require('../../../../src/domain/value-objects/BrokerId');
const { ValidationError } = require('../../../../src/shared/errors');

describe('Broker Entity', () => {
  describe('constructor', () => {
    it('should create a valid broker', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker',
        accentColor: '#FF0000',
        notes: 'Test broker'
      });

      expect(broker.idValue).toBe('galicia');
      expect(broker.displayName).toBe('Galicia');
      expect(broker.type).toBe('broker');
      expect(broker.accentColor).toBe('#FF0000');
      expect(broker.notes).toBe('Test broker');
    });

    it('should create a cash holder', () => {
      const broker = new Broker({
        id: 'cash',
        displayName: 'Cash',
        type: 'cash_holder'
      });

      expect(broker.idValue).toBe('cash');
      expect(broker.type).toBe('cash_holder');
      expect(broker.accentColor).toBeNull();
      expect(broker.notes).toBeNull();
    });

    it('should set default timestamps', () => {
      const broker = new Broker({
        id: 'iol',
        displayName: 'IOL',
        type: 'broker'
      });

      expect(broker.createdAt instanceof Date).toBe(true);
      expect(broker.updatedAt instanceof Date).toBe(true);
    });

    it('should accept provided timestamps', () => {
      const createdAt = new Date('2023-01-01');
      const updatedAt = new Date('2023-01-02');

      const broker = new Broker({
        id: 'iol',
        displayName: 'IOL',
        type: 'broker',
        createdAt,
        updatedAt
      });

      expect(broker.createdAt.getTime()).toBe(createdAt.getTime());
      expect(broker.updatedAt.getTime()).toBe(updatedAt.getTime());
    });

    it('should reject missing displayName', () => {
      expect(() => new Broker({
        id: 'galicia',
        type: 'broker'
      })).toThrow(ValidationError);
    });

    it('should reject empty displayName', () => {
      expect(() => new Broker({
        id: 'galicia',
        displayName: '  ',
        type: 'broker'
      })).toThrow(ValidationError);
    });

    it('should reject invalid type', () => {
      expect(() => new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'invalid'
      })).toThrow(ValidationError);
    });

    it('should normalize broker ID to lowercase', () => {
      const broker = new Broker({
        id: 'GALICIA',
        displayName: 'Galicia',
        type: 'broker'
      });
      expect(broker.idValue).toBe('galicia');
    });
  });

  describe('id getter', () => {
    it('should return BrokerId value object', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      expect(broker.id instanceof BrokerId).toBe(true);
      expect(broker.id.value).toBe('galicia');
    });
  });

  describe('idValue getter', () => {
    it('should return broker ID as string', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      expect(typeof broker.idValue).toBe('string');
      expect(broker.idValue).toBe('galicia');
    });
  });

  describe('isCashHolder', () => {
    it('should return true for cash holders', () => {
      const broker = new Broker({
        id: 'cash',
        displayName: 'Cash',
        type: 'cash_holder'
      });

      expect(broker.isCashHolder()).toBe(true);
    });

    it('should return false for brokers', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      expect(broker.isCashHolder()).toBe(false);
    });
  });

  describe('isBroker', () => {
    it('should return true for brokers', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      expect(broker.isBroker()).toBe(true);
    });

    it('should return false for cash holders', () => {
      const broker = new Broker({
        id: 'cash',
        displayName: 'Cash',
        type: 'cash_holder'
      });

      expect(broker.isBroker()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should return plain object', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker',
        accentColor: '#FF0000',
        notes: 'Test'
      });

      const json = broker.toJSON();

      expect(json.id).toBe('galicia');
      expect(json.displayName).toBe('Galicia');
      expect(json.type).toBe('broker');
      expect(json.accentColor).toBe('#FF0000');
      expect(json.notes).toBe('Test');
      expect(json.createdAt instanceof Date).toBe(true);
      expect(json.updatedAt instanceof Date).toBe(true);
    });
  });

  describe('fromJSON', () => {
    it('should create broker from plain object', () => {
      const data = {
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker',
        accentColor: '#FF0000',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02')
      };

      const broker = Broker.fromJSON(data);

      expect(broker.idValue).toBe('galicia');
      expect(broker.displayName).toBe('Galicia');
    });

    it('should round-trip with toJSON', () => {
      const original = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker',
        accentColor: '#FF0000',
        notes: 'Test'
      });

      const json = original.toJSON();
      const restored = Broker.fromJSON(json);

      expect(restored.equals(original)).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for brokers with same ID', () => {
      const broker1 = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      const broker2 = new Broker({
        id: 'galicia',
        displayName: 'Galicia Modified',
        type: 'cash_holder'
      });

      expect(broker1.equals(broker2)).toBe(true);
    });

    it('should return false for brokers with different IDs', () => {
      const broker1 = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      const broker2 = new Broker({
        id: 'iol',
        displayName: 'IOL',
        type: 'broker'
      });

      expect(broker1.equals(broker2)).toBe(false);
    });

    it('should return false when comparing with non-Broker', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      expect(broker.equals('galicia')).toBe(false);
      expect(broker.equals(null)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should be frozen', () => {
      const broker = new Broker({
        id: 'galicia',
        displayName: 'Galicia',
        type: 'broker'
      });

      broker.displayName = 'Modified'; // Try to modify
      expect(broker.displayName).toBe('Galicia'); // Should still be original
    });
  });
});
