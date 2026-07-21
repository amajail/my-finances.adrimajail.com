/**
 * Azure Settings Repository
 *
 * Implementation of ISettingsRepository using Azure Table Storage.
 * Handles persistence of key-value settings.
 *
 * @implements {ISettingsRepository}
 */

const logger = require('../../shared/logging');
const AzureTableRepository = require('./AzureTableRepository');

class AzureSettingsRepository extends AzureTableRepository {
  /**
   * Create a new AzureSettingsRepository
   * @param {AzureTableDatabase} [database=null] - Database instance
   *                              If null, creates a new instance
   */
  constructor(database = null) {
    super(database);
  }

  /**
   * Get a setting value by key
   * @param {string} key - Settings key
   * @returns {Promise<string|null>} Setting value or null if not found
   */
  async get(key) {
    await this._ensureInitialized();

    const entity = await this._withNotFound(
      () => this._database.settingsClient.getEntity('settings', key),
      null,
      `Failed to get setting: ${key}`
    );
    if (entity === null) {
      logger.debug(`Setting not found: ${key}`);
      return null;
    }
    logger.debug(`Setting retrieved: ${key}`);
    return entity.value || null;
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

    await this._run(
      () => this._database.settingsClient.upsertEntity(entity, 'Replace'),
      `Failed to set setting: ${key}`
    );
    logger.debug(`Setting updated: ${key}`);
  }

  /**
   * Get all settings as an object
   * @returns {Promise<Object>} Object with key-value pairs { [key]: value }
   */
  async getAll() {
    await this._ensureInitialized();

    const filter = `PartitionKey eq 'settings'`;
    const entities = await this._collect(
      this._database.settingsClient.listEntities({ queryOptions: { filter } }),
      (entity) => entity,
      'Failed to get all settings'
    );

    const settings = {};
    for (const entity of entities) {
      settings[entity.rowKey] = entity.value || null;
    }
    logger.debug(`Retrieved ${Object.keys(settings).length} settings`);
    return settings;
  }
}

module.exports = AzureSettingsRepository;
