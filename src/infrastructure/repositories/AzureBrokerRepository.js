/**
 * Azure Broker Repository
 *
 * Implementation of IBrokerRepository using Azure Table Storage.
 * Handles persistence of Broker entities.
 *
 * @implements {IBrokerRepository}
 */

const Broker = require('../../domain/entities/Broker');
const BrokerId = require('../../domain/value-objects/BrokerId');
const logger = require('../../shared/logging');
const AzureTableRepository = require('./AzureTableRepository');

class AzureBrokerRepository extends AzureTableRepository {
  /**
   * Create a new AzureBrokerRepository
   * @param {AzureTableDatabase} [database=null] - Database instance
   *                              If null, creates a new instance
   */
  constructor(database = null) {
    super(database);
  }

  /**
   * Save a new broker
   * @param {Broker} broker - Broker to save
   * @returns {Promise<Broker>} Saved broker
   * @throws {InfrastructureError} If broker already exists
   */
  async save(broker) {
    await this._ensureInitialized();

    const entity = this._toDatabase(broker);
    await this._create(this._database.brokersClient, entity, {
      conflictMessage: `Broker already exists: ${broker.idValue}`,
      conflictLogMessage: `Failed to save broker: Broker already exists: ${broker.idValue}`,
      errorLogMessage: `Failed to save broker: ${broker.idValue}`,
    });
    logger.debug(`Broker saved: ${broker.idValue}`);
    return broker;
  }

  /**
   * Find broker by ID
   * @param {BrokerId|string} brokerId - Broker ID to find
   * @returns {Promise<Broker|null>} Found broker or null
   */
  async findById(brokerId) {
    await this._ensureInitialized();

    const idValue = this._resolveId(brokerId);
    const entity = await this._withNotFound(
      () => this._database.brokersClient.getEntity('broker', idValue),
      null,
      `Failed to find broker: ${idValue}`
    );
    if (entity === null) {
      logger.debug(`Broker not found: ${idValue}`);
      return null;
    }
    logger.debug(`Broker found: ${idValue}`);
    return this._fromDatabase(entity);
  }

  /**
   * Find all brokers, sorted by displayName
   * @returns {Promise<Broker[]>} All brokers
   */
  async findAll() {
    await this._ensureInitialized();

    const brokers = await this._collect(
      this._database.brokersClient.listEntities(),
      (entity) => this._fromDatabase(entity),
      'Failed to list all brokers'
    );
    logger.debug(`Found ${brokers.length} brokers`);
    return brokers.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Update an existing broker
   * @param {Broker} broker - Broker to update
   * @returns {Promise<Broker>} Updated broker
   */
  async update(broker) {
    await this._ensureInitialized();

    const entity = this._toDatabase(broker);
    await this._run(
      () => this._database.brokersClient.upsertEntity(entity, 'Replace'),
      `Failed to update broker: ${broker.idValue}`
    );
    logger.debug(`Broker updated: ${broker.idValue}`);
    return broker;
  }

  /**
   * Delete a broker by ID
   * @param {BrokerId|string} brokerId - Broker ID to delete
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  async delete(brokerId) {
    await this._ensureInitialized();

    const idValue = this._resolveId(brokerId);
    const deleted = await this._withNotFound(
      async () => {
        await this._database.brokersClient.deleteEntity('broker', idValue);
        return true;
      },
      false,
      `Failed to delete broker: ${idValue}`
    );
    logger.debug(deleted ? `Broker deleted: ${idValue}` : `Broker not found for deletion: ${idValue}`);
    return deleted;
  }

  /**
   * Convert Broker entity to database entity
   * @private
   * @param {Broker} broker - Broker entity
   * @returns {Object} Database entity
   */
  _toDatabase(broker) {
    return {
      partitionKey: 'broker',
      rowKey: broker.idValue,
      displayName: broker.displayName,
      type: broker.type,
      accentColor: broker.accentColor || '',
      notes: broker.notes || '',
      createdAt: broker.createdAt.toISOString(),
      updatedAt: broker.updatedAt.toISOString()
    };
  }

  /**
   * Convert database entity to Broker domain entity
   * @private
   * @param {Object} entity - Database entity
   * @returns {Broker} Broker domain entity
   */
  _fromDatabase(entity) {
    return new Broker({
      id: entity.rowKey,
      displayName: entity.displayName,
      type: entity.type,
      accentColor: entity.accentColor || null,
      notes: entity.notes || null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    });
  }

  /**
   * Resolve broker ID from BrokerId instance or string
   * @private
   * @param {BrokerId|string} brokerId - Broker ID
   * @returns {string} Broker ID string value
   */
  _resolveId(brokerId) {
    return super._resolveId(brokerId, BrokerId);
  }
}

module.exports = AzureBrokerRepository;
