/**
 * Azure Position Repository
 *
 * Implementation of IPositionRepository using Azure Table Storage.
 * Handles persistence of Position entities.
 *
 * @implements {IPositionRepository}
 */

const Position = require('../../domain/entities/Position');
const BrokerId = require('../../domain/value-objects/BrokerId');
const AssetType = require('../../domain/value-objects/AssetType');
const logger = require('../../shared/logging');
const AzureTableRepository = require('./AzureTableRepository');

class AzurePositionRepository extends AzureTableRepository {
  /**
   * Create a new AzurePositionRepository
   * @param {AzureTableDatabase} [database=null] - Database instance
   *                              If null, creates a new instance
   */
  constructor(database = null) {
    super(database);
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
    const label = `${position.brokerId.value}/${position.id()}`;
    await this._create(this._database.positionsClient, entity, {
      conflictMessage: `Position already exists: ${label}`,
      conflictLogMessage: `Failed to save position: Position already exists: ${label}`,
      errorLogMessage: `Failed to save position: ${label}`,
    });
    logger.debug(`Position saved: ${label}`);
    return position;
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
    const entity = await this._withNotFound(
      () => this._database.positionsClient.getEntity(brokerIdStr, rowKey),
      null,
      `Failed to find position: ${brokerIdStr}/${rowKey}`
    );
    if (entity === null) {
      logger.debug(`Position not found: ${brokerIdStr}/${rowKey}`);
      return null;
    }
    logger.debug(`Position found: ${brokerIdStr}/${rowKey}`);
    return this._fromDatabase(entity);
  }

  /**
   * Find all positions for a specific broker
   * @param {BrokerId|string} brokerId - Broker ID
   * @returns {Promise<Position[]>} Positions for the broker
   */
  async findByBroker(brokerId) {
    await this._ensureInitialized();

    const brokerIdStr = this._resolveId(brokerId);
    const filter = `PartitionKey eq '${brokerIdStr}'`;
    const positions = await this._collect(
      this._database.positionsClient.listEntities({ queryOptions: { filter } }),
      (entity) => this._fromDatabase(entity),
      `Failed to list positions for broker: ${brokerIdStr}`
    );
    logger.debug(`Found ${positions.length} positions for broker: ${brokerIdStr}`);
    return positions;
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

    const positions = await this._collect(
      this._database.positionsClient.listEntities(),
      (entity) => this._fromDatabase(entity),
      'Failed to list all positions'
    );

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
  }

  /**
   * Update an existing position
   * @param {Position} position - Position to update
   * @returns {Promise<Position>} Updated position
   */
  async update(position) {
    await this._ensureInitialized();

    const entity = this._toDatabase(position);
    const label = `${position.brokerId.value}/${position.id()}`;
    await this._run(
      () => this._database.positionsClient.upsertEntity(entity, 'Replace'),
      `Failed to update position: ${label}`
    );
    logger.debug(`Position updated: ${label}`);
    return position;
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
    const deleted = await this._withNotFound(
      async () => {
        await this._database.positionsClient.deleteEntity(brokerIdStr, rowKey);
        return true;
      },
      false,
      `Failed to delete position: ${brokerIdStr}/${rowKey}`
    );
    logger.debug(deleted
      ? `Position deleted: ${brokerIdStr}/${rowKey}`
      : `Position not found for deletion: ${brokerIdStr}/${rowKey}`);
    return deleted;
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
    return super._resolveId(brokerId, BrokerId);
  }
}

module.exports = AzurePositionRepository;
