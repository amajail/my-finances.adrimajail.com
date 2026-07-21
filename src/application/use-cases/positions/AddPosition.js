/**
 * Add Position Use Case
 *
 * Creates a new position in a broker account.
 * Validates that the broker exists before persisting.
 */

const UseCase = require('../UseCase');
const Position = require('../../../domain/entities/Position');
const logger = require('../../../shared/logging');
const { ValidationError, NotFoundError, DomainError } = require('../../../shared/errors');
const safeAppendAudit = require('../audit/safeAppendAudit');

class AddPosition extends UseCase {
  /**
   * Create a new AddPosition use case
   * @param {Object} deps - Dependencies
   * @param {IBrokerRepository} deps.brokerRepository - Broker repository
   * @param {IPositionRepository} deps.positionRepository - Position repository
   * @param {IAuditRepository} [deps.auditRepository] - Optional write-audit trail (feature 018)
   */
  constructor({ brokerRepository, positionRepository, auditRepository = null }) {
    super();
    this._brokerRepository = brokerRepository;
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

    const errors = [];
    if (!input.brokerId) errors.push({ field: 'brokerId', message: 'brokerId is required' });
    if (!input.assetType) errors.push({ field: 'assetType', message: 'assetType is required' });
    if (!input.symbol) errors.push({ field: 'symbol', message: 'symbol is required' });
    if (input.quantity === undefined || input.quantity === null) errors.push({ field: 'quantity', message: 'quantity is required' });
    if (input.averageCost === undefined || input.averageCost === null) errors.push({ field: 'averageCost', message: 'averageCost is required' });
    if (!input.currency) errors.push({ field: 'currency', message: 'currency is required' });

    if (errors.length > 0) {
      throw ValidationError.fromFieldErrors(errors);
    }
  }

  /**
   * Execute the use case
   * @param {Object} input - { brokerId, assetType, symbol, quantity, averageCost, currency, ...optional }
   * @returns {Promise<Object>} Created position as plain object
   * @throws {NotFoundError} If broker does not exist
   */
  async execute(input) {
    this.validateInput(input);

    logger.debug('AddPosition: executing', { brokerId: input.brokerId, symbol: input.symbol });

    // Verify broker exists
    const broker = await this._brokerRepository.findById(input.brokerId);
    if (!broker) {
      throw new NotFoundError('Broker', input.brokerId);
    }

    // Feature 018 (FR-009): reject duplicates explicitly, pointing at the
    // existing record — the storage-level 409 remains as a race backstop but
    // surfaces as an opaque 502.
    const rowKey = `${input.assetType}__${input.symbol}`;
    const existing = await this._positionRepository.findById(input.brokerId, rowKey);
    if (existing) {
      const existingStatus = existing.toJSON().status;
      throw new DomainError(
        existingStatus === 'open'
          ? `Position already exists: ${input.brokerId}/${rowKey} (open). Use update_position (PUT) to modify it instead of creating a duplicate.`
          : `A closed position already exists at ${input.brokerId}/${rowKey}. Reopen it via update_position (status: "open") instead of creating a new one.`
      );
    }

    const position = new Position({
      brokerId: input.brokerId,
      assetType: input.assetType,
      symbol: input.symbol,
      displayName: input.displayName || null,
      quantity: input.quantity,
      averageCost: input.averageCost,
      currency: input.currency,
      currentPrice: input.currentPrice || null,
      currentPriceUpdatedAt: input.currentPriceUpdatedAt || null,
      exchange: input.exchange || null,
      maturityDate: input.maturityDate || null,
      status: input.status || 'open',
      realizedPnl: input.realizedPnl || 0,
      notes: input.notes || null
    });

    const saved = await this._positionRepository.save(position);
    logger.info('Position added', { brokerId: input.brokerId, positionId: saved.id() });

    // Feature 018: audit the creation (every provided field, old = null).
    const savedData = saved.toJSON();
    const changes = Object.entries(savedData)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([field, value]) => ({ field, old: null, new: value }));
    await safeAppendAudit(this._auditRepository, {
      operation: 'create_position',
      targetType: 'position',
      targetId: `${input.brokerId}/${saved.id()}`,
      changes,
      confirmationUsed: false,
      source: (input._audit && input._audit.source) || 'api',
    });

    return { ...savedData, id: saved.id() };
  }
}

module.exports = AddPosition;
