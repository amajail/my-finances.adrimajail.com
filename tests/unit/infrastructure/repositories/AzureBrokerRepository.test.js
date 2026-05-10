/**
 * AzureBrokerRepository Unit Tests
 */

const AzureBrokerRepository = require('../../../../src/infrastructure/repositories/AzureBrokerRepository');
const Broker = require('../../../../src/domain/entities/Broker');
const BrokerId = require('../../../../src/domain/value-objects/BrokerId');
const { createMockTableClient } = require('../../../helpers/mock-table-client');
const { InfrastructureError } = require('../../../../src/shared/errors');

describe('AzureBrokerRepository', () => {
  let mockDb;
  let repository;

  beforeEach(() => {
    mockDb = {
      brokersClient: createMockTableClient(),
      positionsClient: createMockTableClient(),
      settingsClient: createMockTableClient(),
      pricesClient: createMockTableClient()
    };
    repository = new AzureBrokerRepository(mockDb);
  });

  describe('save', () => {
    it('should save a new broker', async () => {
      const broker = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker',
        accentColor: '#FF0000',
        notes: 'A test broker',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      });

      const result = await repository.save(broker);

      expect(result).toEqual(broker);
      expect(mockDb.brokersClient.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          partitionKey: 'broker',
          rowKey: 'test-broker',
          displayName: 'Test Broker',
          type: 'broker'
        })
      );
    });

    it('should throw InfrastructureError on duplicate', async () => {
      const broker = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker'
      });

      // Save the first one
      await repository.save(broker);

      // Try to save duplicate
      const error = new Error('Conflict');
      error.statusCode = 409;
      mockDb.brokersClient.createEntity.mockRejectedValueOnce(error);

      await expect(repository.save(broker)).rejects.toThrow(InfrastructureError);
    });
  });

  describe('findById', () => {
    it('should find a broker by ID (string)', async () => {
      const broker = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker'
      });
      await repository.save(broker);

      const found = await repository.findById('test-broker');

      expect(found).not.toBeNull();
      expect(found.displayName).toBe('Test Broker');
      expect(found.idValue).toBe('test-broker');
    });

    it('should find a broker by ID (BrokerId instance)', async () => {
      const broker = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker'
      });
      await repository.save(broker);

      const brokerId = BrokerId.of('test-broker');
      const found = await repository.findById(brokerId);

      expect(found).not.toBeNull();
      expect(found.idValue).toBe('test-broker');
    });

    it('should return null when broker not found', async () => {
      const found = await repository.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all brokers sorted by displayName', async () => {
      const broker1 = new Broker({
        id: 'broker-z',
        displayName: 'Zebra Broker',
        type: 'broker'
      });
      const broker2 = new Broker({
        id: 'broker-a',
        displayName: 'Alpha Broker',
        type: 'broker'
      });

      await repository.save(broker1);
      await repository.save(broker2);

      const all = await repository.findAll();

      expect(all).toHaveLength(2);
      expect(all[0].displayName).toBe('Alpha Broker');
      expect(all[1].displayName).toBe('Zebra Broker');
    });

    it('should return empty array when no brokers exist', async () => {
      const all = await repository.findAll();
      expect(all).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update an existing broker', async () => {
      const broker = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker',
        notes: 'Original notes'
      });
      await repository.save(broker);

      // Create updated version
      const updated = new Broker({
        id: 'test-broker',
        displayName: 'Updated Broker',
        type: 'broker',
        notes: 'Updated notes',
        createdAt: broker.createdAt,
        updatedAt: new Date()
      });

      const result = await repository.update(updated);

      expect(result.displayName).toBe('Updated Broker');
      expect(mockDb.brokersClient.upsertEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Updated Broker',
          notes: 'Updated notes'
        }),
        'Replace'
      );
    });
  });

  describe('delete', () => {
    it('should delete a broker', async () => {
      const broker = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker'
      });
      await repository.save(broker);

      const result = await repository.delete('test-broker');

      expect(result).toBe(true);
      expect(mockDb.brokersClient.deleteEntity).toHaveBeenCalledWith('broker', 'test-broker');
    });

    it('should return false when broker not found', async () => {
      mockDb.brokersClient.deleteEntity.mockRejectedValueOnce(
        Object.assign(new Error('Not found'), { statusCode: 404 })
      );

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('mapper round-trip', () => {
    it('should correctly map Broker to database and back', async () => {
      const original = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker',
        accentColor: '#FF5500',
        notes: 'Some notes',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z')
      });

      await repository.save(original);
      const found = await repository.findById('test-broker');

      expect(found.displayName).toBe(original.displayName);
      expect(found.type).toBe(original.type);
      expect(found.accentColor).toBe(original.accentColor);
      expect(found.notes).toBe(original.notes);
    });

    it('should handle null optional fields', async () => {
      const broker = new Broker({
        id: 'test-broker',
        displayName: 'Test Broker',
        type: 'broker',
        accentColor: null,
        notes: null
      });

      await repository.save(broker);
      const found = await repository.findById('test-broker');

      expect(found.accentColor).toBeNull();
      expect(found.notes).toBeNull();
    });
  });

  describe('_resolveId', () => {
    it('should resolve BrokerId instance to string', () => {
      const brokerId = BrokerId.of('test-broker');
      const resolved = repository._resolveId(brokerId);
      expect(resolved).toBe('test-broker');
    });

    it('should resolve string to string', () => {
      const resolved = repository._resolveId('test-broker');
      expect(resolved).toBe('test-broker');
    });
  });
});
