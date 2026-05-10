/**
 * AzureSettingsRepository Unit Tests
 */

const AzureSettingsRepository = require('../../../../src/infrastructure/repositories/AzureSettingsRepository');
const { createMockTableClient } = require('../../../helpers/mock-table-client');

describe('AzureSettingsRepository', () => {
  let mockDb;
  let repository;

  beforeEach(() => {
    mockDb = {
      brokersClient: createMockTableClient(),
      positionsClient: createMockTableClient(),
      settingsClient: createMockTableClient(),
      pricesClient: createMockTableClient()
    };
    repository = new AzureSettingsRepository(mockDb);
  });

  describe('set and get', () => {
    it('should set and retrieve a string setting', async () => {
      await repository.set('mep_rate', '150.5');
      const value = await repository.get('mep_rate');
      expect(value).toBe('150.5');
    });

    it('should set and retrieve a number setting', async () => {
      await repository.set('max_positions', '100');
      const value = await repository.get('max_positions');
      expect(value).toBe('100');
    });

    it('should set and retrieve a boolean setting', async () => {
      await repository.set('enable_notifications', 'true');
      const value = await repository.get('enable_notifications');
      expect(value).toBe('true');
    });

    it('should convert value to string', async () => {
      await repository.set('count', 42);
      const value = await repository.get('count');
      expect(value).toBe('42');
    });

    it('should return null for non-existent key', async () => {
      const value = await repository.get('non_existent_key');
      expect(value).toBeNull();
    });

    it('should update an existing setting', async () => {
      await repository.set('test_key', 'value1');
      await repository.set('test_key', 'value2');
      const value = await repository.get('test_key');
      expect(value).toBe('value2');
    });
  });

  describe('getAll', () => {
    it('should retrieve all settings', async () => {
      await repository.set('key1', 'value1');
      await repository.set('key2', 'value2');
      await repository.set('key3', 'value3');

      const all = await repository.getAll();

      expect(all).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3'
      });
    });

    it('should return empty object when no settings exist', async () => {
      const all = await repository.getAll();
      expect(all).toEqual({});
    });

    it('should include updated settings', async () => {
      await repository.set('key1', 'value1');
      await repository.set('key1', 'updated1');
      await repository.set('key2', 'value2');

      const all = await repository.getAll();

      expect(all.key1).toBe('updated1');
      expect(all.key2).toBe('value2');
    });
  });

  describe('database entity structure', () => {
    it('should create entity with correct structure', async () => {
      const beforeSet = Date.now();
      await repository.set('test_key', 'test_value');
      const afterSet = Date.now();

      const entities = mockDb.settingsClient._getAllEntities();
      expect(entities).toHaveLength(1);

      const entity = entities[0];
      expect(entity.partitionKey).toBe('settings');
      expect(entity.rowKey).toBe('test_key');
      expect(entity.value).toBe('test_value');
      expect(entity.updatedAt).toBeDefined();

      const updatedAt = new Date(entity.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeSet);
      expect(updatedAt.getTime()).toBeLessThanOrEqual(afterSet);
    });
  });
});
