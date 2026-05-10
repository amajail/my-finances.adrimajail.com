/**
 * Azure Broker Repository
 *
 * Implementation of IBrokerRepository using Azure Table Storage.
 * Handles persistence of Broker entities.
 */

const IBrokerRepository = require('../../application/interfaces/IBrokerRepository');
const Broker = require('../../domain/entities/Broker');
const BrokerId = require('../../domain/value-objects/BrokerId');
const logger = require('../../shared/logging');
const { InfrastructureError } = require('../../shared/errors');

class AzureBrokerRepository extends IBrokerRepository {
  /**
   * Create a new AzureBrokerRepository
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
   * Save a new broker
   * @param {Broker} broker - Broker to save
   * @returns {Promise<Broker>} Saved broker
   * @throws {InfrastructureError} If broker already exists
   */
  async save(broker) {
    await this._ensureInitialized();

    const entity = this._toDatabase(broker);
    try {
      await this._database.brokersClient.createEntity(entity);
      logger.debug(`Broker saved: ${broker.idValue}`);
      return broker;
    } catch (error) {
      if (error.statusCode === 409) {
        const msg = `Broker already exists: ${broker.idValue}`;
        logger.error(`Failed to save broker: ${msg}`, error);
        throw new InfrastructureError(msg);
      }
      logger.error(`Failed to save broker: ${broker.idValue}`, error);
      throw error;
    }
  }

  /**
   * Find broker by ID
   * @param {BrokerId|string} brokerId - Broker ID to find
   * @returns {Promise<Broker|null>} Found broker or null
   */
  async findById(brokerId) {
    await this._ensureInitialized();

    const idValue = this._resolveId(brokerId);
    try {
      const entity = await this._database.brokersClient.getEntity('broker', idValue);
      logger.debug(`Broker found: ${idValue}`);
      return this._fromDatabase(entity);
    } catch (error) {
      if (error.statusCode === 404) {
        logger.debug(`Broker not found: ${idValue}`);
        return null;
      }
      logger.error(`Failed to find broker: ${idValue}`, error);
      throw error;
    }
  }

  /**
   * Find all brokers, sorted by displayName
   * @returns {Promise<Broker[]>} All brokers
   */
  async findAll() {
    await this._ensureInitialized();

    const brokers = [];
    try {
      for await (const entity of this._database.brokersClient.listEntities()) {
        brokers.push(this._fromDatabase(entity));
      }
      logger.debug(`Found ${brokers.length} brokers`);
      return brokers.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch (error) {
      logger.error('Failed to list all brokers', error);
      throw error;
    }
  }

  /**
   * Update an existing broker
   * @param {Broker} broker - Broker to update
   * @returns {Promise<Broker>} Updated broker
   */
  async update(broker) {
    await this._ensureInitialized();

    const entity = this._toDatabase(broker);
    try {
      await this._database.brokersClient.upsertEntity(entity, 'Replace');
      logger.debug(`Broker updated: ${broker.idValue}`);
      return broker;
    } catch (error) {
      logger.error(`Failed to update broker: ${broker.idValue}`, error);
      throw error;
    }
  }

  /**
   * Delete a broker by ID
   * @param {BrokerId|string} brokerId - Broker ID to delete
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  async delete(brokerId) {
    await this._ensureInitialized();

    const idValue = this._resolveId(brokerId);
    try {
      await this._database.brokersClient.deleteEntity('broker', idValue);
      logger.debug(`Broker deleted: ${idValue}`);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        logger.debug(`Broker not found for deletion: ${idValue}`);
        return false;
      }
      logger.error(`Failed to delete broker: ${idValue}`, error);
      throw error;
    }
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
    if (brokerId instanceof BrokerId) {
      return brokerId.value;
    }
    return String(brokerId);
  }
}

module.exports = AzureBrokerRepository;
