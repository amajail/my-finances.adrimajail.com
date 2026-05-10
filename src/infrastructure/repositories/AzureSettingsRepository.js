/**
 * Azure Settings Repository
 *
 * Implementation of ISettingsRepository using Azure Table Storage.
 * Handles persistence of key-value settings.
 */

const ISettingsRepository = require('../../application/interfaces/ISettingsRepository');
const logger = require('../../shared/logging');

class AzureSettingsRepository extends ISettingsRepository {
  /**
   * Create a new AzureSettingsRepository
   * @param {AzureTableDatabase} [database=null] - Database instance
   *                              If null, creates a new instance
   */
  constructor(database = null) {
    super();
    this._database = database;
    this._initialized = false;
  }

  /**
   * Lazy initialize database if not provided in constructor
   * @private
   * @returns {Promise<void>}
   */
  async _ensureInitialized() {
    if (!this._initialized && !this._database) {
      const AzureTableDatabase = require('../../database/AzureTableDatabase');
      this._database = new AzureTableDatabase();
      await this._database.initialize();
      this._initialized = true;
    }
  }

  /**
   * Get a setting value by key
   * @param {string} key - Settings key
   * @returns {Promise<string|null>} Setting value or null if not found
   */
  async get(key) {
    await this._ensureInitialized();

    try {
      const entity = await this._database.settingsClient.getEntity('settings', key);
      logger.debug(`Setting retrieved: ${key}`);
      return entity.value || null;
    } catch (error) {
      if (error.statusCode === 404) {
        logger.debug(`Setting not found: ${key}`);
        return null;
      }
      logger.error(`Failed to get setting: ${key}`, error);
      throw error;
    }
  }

  /**
   * Set a setting value by key
   * @param {string} key - Settings key
   * @param {string|number|boolean} value - Setting value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    await this._ensureInitialized();

    const entity = {
      partitionKey: 'settings',
      rowKey: key,
      value: String(value),
      updatedAt: new Date().toISOString()
    };

    try {
      await this._database.settingsClient.upsertEntity(entity, 'Replace');
      logger.debug(`Setting updated: ${key}`);
    } catch (error) {
      logger.error(`Failed to set setting: ${key}`, error);
      throw error;
    }
  }

  /**
   * Get all settings as an object
   * @returns {Promise<Object>} Object with key-value pairs { [key]: value }
   */
  async getAll() {
    await this._ensureInitialized();

    const settings = {};
    try {
      const filter = `PartitionKey eq 'settings'`;
      for await (const entity of this._database.settingsClient.listEntities({ queryOptions: { filter } })) {
        settings[entity.rowKey] = entity.value || null;
      }
      logger.debug(`Retrieved ${Object.keys(settings).length} settings`);
      return settings;
    } catch (error) {
      logger.error('Failed to get all settings', error);
      throw error;
    }
  }
}

module.exports = AzureSettingsRepository;
