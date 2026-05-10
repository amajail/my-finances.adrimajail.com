/**
 * IPositionRepository Interface
 *
 * Repository interface for Position persistence following Repository pattern.
 * Defines the contract for Position data access operations.
 * Infrastructure layer will implement this interface.
 */

/**
 * Position Repository Interface
 * @interface
 */
class IPositionRepository {
  /**
   * Save a new position
   * @param {Position} position - Position to save
   * @returns {Promise<Position>} Saved position
   * @abstract
   */
  async save(position) {
    throw new Error('Method not implemented: save');
  }

  /**
   * Find position by broker ID and row key
   * @param {BrokerId|string} brokerId - Broker ID
   * @param {string} rowKey - Position row key (assetType__symbol)
   * @returns {Promise<Position|null>} Found position or null
   * @abstract
   */
  async findById(brokerId, rowKey) {
    throw new Error('Method not implemented: findById');
  }

  /**
   * Find all positions for a specific broker
   * @param {BrokerId|string} brokerId - Broker ID
   * @returns {Promise<Position[]>} Positions for the broker
   * @abstract
   */
  async findByBroker(brokerId) {
    throw new Error('Method not implemented: findByBroker');
  }

  /**
   * Find all positions with optional filtering
   * @param {Object} [filter={}] - Filter options
   * @param {string} [filter.status='all'] - Filter by status ('open', 'closed', 'all')
   * @param {string} [filter.assetType] - Filter by asset type
   * @returns {Promise<Position[]>} Filtered positions
   * @abstract
   */
  async findAll(filter = {}) {
    throw new Error('Method not implemented: findAll');
  }

  /**
   * Update an existing position
   * @param {Position} position - Position to update
   * @returns {Promise<Position>} Updated position
   * @abstract
   */
  async update(position) {
    throw new Error('Method not implemented: update');
  }

  /**
   * Delete a position by broker ID and row key
   * @param {BrokerId|string} brokerId - Broker ID
   * @param {string} rowKey - Position row key (assetType__symbol)
   * @returns {Promise<boolean>} Whether deletion was successful
   * @abstract
   */
  async delete(brokerId, rowKey) {
    throw new Error('Method not implemented: delete');
  }

  /**
   * Find open positions that require price quotes
   * Only returns positions with status='open' AND AssetType.requiresPriceQuote(assetType)===true
   * @returns {Promise<Position[]>} Open positions requiring price quotes
   * @abstract
   */
  async findOpenWithPriceQuotable() {
    throw new Error('Method not implemented: findOpenWithPriceQuotable');
  }
}

module.exports = IPositionRepository;
