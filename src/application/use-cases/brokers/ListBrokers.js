/**
 * List Brokers Use Case
 *
 * Retrieves all brokers from the repository.
 * Returns brokers sorted by display name.
 */

const UseCase = require('../UseCase');
const logger = require('../../../shared/logging');

class ListBrokers extends UseCase {
  /**
   * Create a new ListBrokers use case
   * @param {Object} deps - Dependencies
   * @param {IBrokerRepository} deps.brokerRepository - Broker repository
   */
  constructor({ brokerRepository }) {
    super();
    this._brokerRepository = brokerRepository;
  }

  /**
   * Execute the use case
   * @param {Object} _input - Input (unused)
   * @returns {Promise<Array>} Array of brokers as plain objects
   */
  async execute(_input) {
    logger.debug('ListBrokers: executing');
    const brokers = await this._brokerRepository.findAll();
    return brokers.map(b => b.toJSON());
  }
}

module.exports = ListBrokers;
