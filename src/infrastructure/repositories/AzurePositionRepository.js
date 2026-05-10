/**
 * Azure Position Repository
 *
 * Implementation of IPositionRepository using Azure Table Storage.
 * Handles persistence of Position entities.
 */

const IPositionRepository = require('../../application/interfaces/IPositionRepository');
const Position = require('../../domain/entities/Position');
const BrokerId = require('../../domain/value-objects/BrokerId');
const AssetType = require('../../domain/value-objects/AssetType');
const logger = require('../../shared/logging');
const { InfrastructureError } = require('../../shared/errors');

class AzurePositionRepository extends IPositionRepository {
  /**
   * Create a new AzurePositionRepository
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
   * Save a new position
   * @param {Position} position - Position to save
   * @returns {Promise<Position>} Saved position
   * @throws {InfrastructureError} If position already exists
   */
  async save(position) {
    await this._ensureInitialized();

    const entity = this._toDatabase(position);
    try {
      await this._database.positionsClient.createEntity(entity);
      logger.debug(`Position saved: ${position.brokerId.value}/${position.id()}`);
      return position;
    } catch (error) {
      if (error.statusCode === 409) {
        const msg = `Position already exists: ${position.brokerId.value}/${position.id()}`;
        logger.error(`Failed to save position: ${msg}`, error);
        throw new InfrastructureError(msg);
      }
      logger.error(`Failed to save position: ${position.brokerId.value}/${position.id()}`, error);
      throw error;
    }
  }

  /**
   * Find position by broker ID and row key
   * @param {BrokerId|string} brokerId - Broker ID
   * @param {string} rowKey - Position row key (assetType__symbol)
   * @returns {Promise<Position|null>} Found position or null
   */
  async findById(brokerId, rowKey) {
    await this._ensureInitialized();

    const brokerIdStr = this._resolveId(brokerId);
    try {
      const entity = await this._database.positionsClient.getEntity(brokerIdStr, rowKey);
      logger.debug(`Position found: ${brokerIdStr}/${rowKey}`);
      return this._fromDatabase(entity);
    } catch (error) {
      if (error.statusCode === 404) {
        logger.debug(`Position not found: ${brokerIdStr}/${rowKey}`);
        return null;
      }
      logger.error(`Failed to find position: ${brokerIdStr}/${rowKey}`, error);
      throw error;
    }
  }

  /**
   * Find all positions for a specific broker
   * @param {BrokerId|string} brokerId - Broker ID
   * @returns {Promise<Position[]>} Positions for the broker
   */
  async findByBroker(brokerId) {
    await this._ensureInitialized();

    const brokerIdStr = this._resolveId(brokerId);
    const positions = [];
    try {
      const filter = `PartitionKey eq '${brokerIdStr}'`;
      for await (const entity of this._database.positionsClient.listEntities({ queryOptions: { filter } })) {
        positions.push(this._fromDatabase(entity));
      }
      logger.debug(`Found ${positions.length} positions for broker: ${brokerIdStr}`);
      return positions;
    } catch (error) {
      logger.error(`Failed to list positions for broker: ${brokerIdStr}`, error);
      throw error;
    }
  }

  /**
   * Find all positions with optional filtering
   * @param {Object} [filter={}] - Filter options
   * @param {string} [filter.status='all'] - Filter by status ('open', 'closed', 'all')
   * @param {string} [filter.assetType] - Filter by asset type
   * @returns {Promise<Position[]>} Filtered positions
   */
  async findAll(filter = {}) {
    await this._ensureInitialized();

    const positions = [];
    try {
      for await (const entity of this._database.positionsClient.listEntities()) {
        positions.push(this._fromDatabase(entity));
      }

      // Apply JS-level filters
      let filtered = positions;

      // Filter by status
      const status = filter.status || 'all';
      if (status !== 'all') {
        filtered = filtered.filter(p => p.status === status);
      }

      // Filter by assetType
      if (filter.assetType) {
        filtered = filtered.filter(p => p.assetType === filter.assetType);
      }

      logger.debug(`Found ${filtered.length} positions (total: ${positions.length}) with filters: ${JSON.stringify(filter)}`);
      return filtered;
    } catch (error) {
      logger.error('Failed to list all positions', error);
      throw error;
    }
  }

  /**
   * Update an existing position
   * @param {Position} position - Position to update
   * @returns {Promise<Position>} Updated position
   */
  async update(position) {
    await this._ensureInitialized();

    const entity = this._toDatabase(position);
    try {
      await this._database.positionsClient.upsertEntity(entity, 'Replace');
      logger.debug(`Position updated: ${position.brokerId.value}/${position.id()}`);
      return position;
    } catch (error) {
      logger.error(`Failed to update position: ${position.brokerId.value}/${position.id()}`, error);
      throw error;
    }
  }

  /**
   * Delete a position by broker ID and row key
   * @param {BrokerId|string} brokerId - Broker ID
   * @param {string} rowKey - Position row key (assetType__symbol)
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  async delete(brokerId, rowKey) {
    await this._ensureInitialized();

    const brokerIdStr = this._resolveId(brokerId);
    try {
      await this._database.positionsClient.deleteEntity(brokerIdStr, rowKey);
      logger.debug(`Position deleted: ${brokerIdStr}/${rowKey}`);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        logger.debug(`Position not found for deletion: ${brokerIdStr}/${rowKey}`);
        return false;
      }
      logger.error(`Failed to delete position: ${brokerIdStr}/${rowKey}`, error);
      throw error;
    }
  }

  /**
   * Find open positions that require price quotes
   * @returns {Promise<Position[]>} Open positions requiring price quotes
   */
  async findOpenWithPriceQuotable() {
    const positions = await this.findAll({ status: 'open' });
    const filtered = positions.filter(p => AssetType.requiresPriceQuote(p.assetType));
    logger.debug(`Found ${filtered.length} open positions requiring price quotes`);
    return filtered;
  }

  /**
   * Convert Position entity to database entity
   * @private
   * @param {Position} position - Position entity
   * @returns {Object} Database entity
   */
  _toDatabase(position) {
    return {
      partitionKey: position.brokerId.value,
      rowKey: position.id(),
      brokerId: position.brokerId.value,
      assetType: position.assetType,
      symbol: position.symbol.value,
      displayName: position.displayName || '',
      quantity: position.quantity.value,
      averageCost: position.averageCost,
      currency: position.currency,
      currentPrice: position.currentPrice ?? 0,
      currentPriceUpdatedAt: position.currentPriceUpdatedAt ? position.currentPriceUpdatedAt.toISOString() : '',
      exchange: position.exchange || '',
      maturityDate: position.maturityDate || '',
      status: position.status,
      realizedPnl: position.realizedPnl,
      notes: position.notes || '',
      createdAt: position.createdAt.toISOString(),
      updatedAt: position.updatedAt.toISOString()
    };
  }

  /**
   * Convert database entity to Position domain entity
   * @private
   * @param {Object} entity - Database entity
   * @returns {Position} Position domain entity
   */
  _fromDatabase(entity) {
    return new Position({
      brokerId: entity.brokerId,
      assetType: entity.assetType,
      symbol: entity.symbol,
      displayName: entity.displayName || null,
      quantity: entity.quantity,
      averageCost: entity.averageCost,
      currency: entity.currency,
      currentPrice: entity.currentPrice || null,
      currentPriceUpdatedAt: entity.currentPriceUpdatedAt ? new Date(entity.currentPriceUpdatedAt) : null,
      exchange: entity.exchange || null,
      maturityDate: entity.maturityDate || null,
      status: entity.status,
      realizedPnl: entity.realizedPnl,
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

module.exports = AzurePositionRepository;
