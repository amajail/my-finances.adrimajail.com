/**
 * List Positions Use Case
 *
 * Retrieves positions from the repository, optionally filtered by broker and status.
 */

const UseCase = require('../UseCase');
const logger = require('../../../shared/logging');

class ListPositions extends UseCase {
  /**
   * Create a new ListPositions use case
   * @param {Object} deps - Dependencies
   * @param {IPositionRepository} deps.positionRepository - Position repository
   */
  constructor({ positionRepository }) {
    super();
    this._positionRepository = positionRepository;
  }

  /**
   * Execute the use case
   * @param {Object} input - { broker?, status? }
   * @returns {Promise<Array>} Array of positions as plain objects
   */
  async execute(input = {}) {
    logger.debug('ListPositions: executing', { broker: input.broker, status: input.status });

    let positions;
    if (input.broker) {
      positions = await this._positionRepository.findByBroker(input.broker);
    } else {
      positions = await this._positionRepository.findAll(input.status ? { status: input.status } : undefined);
    }

    return positions.map(p => ({ ...p.toJSON(), id: p.id() }));
  }
}

module.exports = ListPositions;
