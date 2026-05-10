/**
 * Update Position Use Case
 *
 * Updates an existing position with new data.
 * Loads the existing position, merges patches, and persists the updated version.
 */

const UseCase = require('../UseCase');
const Position = require('../../../domain/entities/Position');
const logger = require('../../../shared/logging');
const { ValidationError, NotFoundError } = require('../../../shared/errors');

class UpdatePosition extends UseCase {
  /**
   * Create a new UpdatePosition use case
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
   * @param {Object} input - { brokerId, rowKey, ...patches }
   * @returns {Promise<Object>} Updated position as plain object
   * @throws {NotFoundError} If position does not exist
   */
  async execute(input) {
    this.validateInput(input);

    logger.debug('UpdatePosition: executing', { brokerId: input.brokerId, rowKey: input.rowKey });

    // Load existing position
    const existing = await this._positionRepository.findById(input.brokerId, input.rowKey);
    if (!existing) {
      throw new NotFoundError('Position', `${input.brokerId}/${input.rowKey}`);
    }

    // Build merged data
    const existingData = existing.toJSON();
    const merged = { ...existingData };

    // Apply patches, excluding internal metadata
    const allowedFields = [
      'displayName', 'quantity', 'averageCost', 'currentPrice', 'currentPriceUpdatedAt',
      'exchange', 'maturityDate', 'status', 'realizedPnl', 'notes'
    ];

    allowedFields.forEach(field => {
      if (field in input) {
        merged[field] = input[field];
      }
    });

    // Create updated position
    const updated = new Position(merged);

    // Persist
    await this._positionRepository.update(updated);
    logger.info('Position updated', { brokerId: input.brokerId, positionId: updated.id() });
    return { ...updated.toJSON(), id: updated.id() };
  }
}

module.exports = UpdatePosition;
