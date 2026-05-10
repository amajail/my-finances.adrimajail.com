/**
 * Delete Position Use Case
 *
 * Deletes an existing position from the system.
 */

const UseCase = require('../UseCase');
const logger = require('../../../shared/logging');
const { ValidationError, NotFoundError } = require('../../../shared/errors');

class DeletePosition extends UseCase {
  /**
   * Create a new DeletePosition use case
   * @param {Object} deps - Dependencies
   * @param {IPositionRepository} deps.positionRepository - Position repository
   */
  constructor({ positionRepository }) {
    super();
    this._positionRepository = positionRepository;
  }

  /**
   * Validate input parameters
   * @override
   * @param {Object} input - Input to validate
   * @throws {ValidationError} If validation fails
   */
  validateInput(input) {
    super.validateInput(input);

    if (!input.brokerId) {
      throw new ValidationError('brokerId is required', [{ field: 'brokerId', message: 'brokerId is required' }]);
    }

    if (!input.rowKey) {
      throw new ValidationError('rowKey is required', [{ field: 'rowKey', message: 'rowKey is required' }]);
    }
  }

  /**
   * Execute the use case
   * @param {Object} input - { brokerId, rowKey }
   * @returns {Promise<Object>} { deleted: true }
   * @throws {NotFoundError} If position does not exist
   */
  async execute(input) {
    this.validateInput(input);

    logger.debug('DeletePosition: executing', { brokerId: input.brokerId, rowKey: input.rowKey });

    const deleted = await this._positionRepository.delete(input.brokerId, input.rowKey);
    if (!deleted) {
      throw new NotFoundError('Position', `${input.brokerId}/${input.rowKey}`);
    }

    logger.info('Position deleted', { brokerId: input.brokerId, rowKey: input.rowKey });
    return { deleted: true };
  }
}

module.exports = DeletePosition;
