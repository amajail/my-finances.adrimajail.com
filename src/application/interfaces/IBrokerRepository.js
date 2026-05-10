/**
 * IBrokerRepository Interface
 *
 * Repository interface for Broker persistence following Repository pattern.
 * Defines the contract for Broker data access operations.
 * Infrastructure layer will implement this interface.
 */

/**
 * Broker Repository Interface
 * @interface
 */
class IBrokerRepository {
  /**
   * Save a new broker
   * @param {Broker} broker - Broker to save
   * @returns {Promise<Broker>} Saved broker
   * @abstract
   */
  async save(broker) {
    throw new Error('Method not implemented: save');
  }

  /**
   * Find broker by ID
   * @param {BrokerId|string} brokerId - Broker ID to find
   * @returns {Promise<Broker|null>} Found broker or null
   * @abstract
   */
  async findById(brokerId) {
    throw new Error('Method not implemented: findById');
  }

  /**
   * Find all brokers
   * @returns {Promise<Broker[]>} All brokers
   * @abstract
   */
  async findAll() {
    throw new Error('Method not implemented: findAll');
  }

  /**
   * Update an existing broker
   * @param {Broker} broker - Broker to update
   * @returns {Promise<Broker>} Updated broker
   * @abstract
   */
  async update(broker) {
    throw new Error('Method not implemented: update');
  }

  /**
   * Delete a broker by ID
   * @param {BrokerId|string} brokerId - Broker ID to delete
   * @returns {Promise<boolean>} Whether deletion was successful
   * @abstract
   */
  async delete(brokerId) {
    throw new Error('Method not implemented: delete');
  }
}

module.exports = IBrokerRepository;
