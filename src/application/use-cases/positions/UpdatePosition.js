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
const safeAppendAudit = require('../audit/safeAppendAudit');

class UpdatePosition extends UseCase {
  /**
   * Create a new UpdatePosition use case
   * @param {Object} deps - Dependencies
   * @param {IPositionRepository} deps.positionRepository - Position repository
   * @param {IAuditRepository} [deps.auditRepository] - Optional write-audit trail (feature 018)
   */
  constructor({ positionRepository, auditRepository = null }) {
    super();
    this._positionRepository = positionRepository;
    this._auditRepository = auditRepository;
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
      'displayName', 'quantity', 'averageCost', 'currency', 'currentPrice', 'currentPriceUpdatedAt',
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

    // Feature 018: audit field-level old/new for the applied patch (both the
    // dashboard/API path and the MCP path — every write is recorded).
    const updatedData = updated.toJSON();
    const changes = allowedFields
      .filter((field) => field in input && existingData[field] !== updatedData[field])
      .map((field) => ({ field, old: existingData[field], new: updatedData[field] }));
    await safeAppendAudit(this._auditRepository, {
      operation: 'update_position',
      targetType: 'position',
      targetId: `${input.brokerId}/${input.rowKey}`,
      changes,
      confirmationUsed: !!(input._audit && input._audit.confirmationUsed),
      source: (input._audit && input._audit.source) || 'api',
    });

    return { ...updatedData, id: updated.id() };
  }
}

module.exports = UpdatePosition;
