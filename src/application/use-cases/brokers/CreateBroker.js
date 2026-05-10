/**
 * Create Broker Use Case
 *
 * Creates a new broker in the system.
 * Validates required fields and persists the broker.
 */

const UseCase = require('../UseCase');
const Broker = require('../../../domain/entities/Broker');
const logger = require('../../../shared/logging');
const { ValidationError } = require('../../../shared/errors');

class CreateBroker extends UseCase {
  /**
   * Create a new CreateBroker use case
   * @param {Object} deps - Dependencies
   * @param {IBrokerRepository} deps.brokerRepository - Broker repository
   */
  constructor({ brokerRepository }) {
    super();
    this._brokerRepository = brokerRepository;
  }

  /**
   * Validate input parameters
   * @override
   * @param {Object} input - Input to validate
   * @throws {ValidationError} If validation fails
   */
  validateInput(input) {
    super.validateInput(input);

    if (!input.id) {
      throw new ValidationError('id is required', [{ field: 'id', message: 'id is required' }]);
    }

    if (!input.displayName) {
      throw new ValidationError('displayName is required', [{ field: 'displayName', message: 'displayName is required' }]);
    }

    if (!input.type) {
      throw new ValidationError('type is required', [{ field: 'type', message: 'type is required' }]);
    }

    if (!['broker', 'cash_holder'].includes(input.type)) {
      throw new ValidationError('type must be "broker" or "cash_holder"', [{ field: 'type', message: 'type must be "broker" or "cash_holder"' }]);
    }
  }

  /**
   * Execute the use case
   * @param {Object} input - { id, displayName, type, accentColor?, notes? }
   * @returns {Promise<Object>} Created broker as plain object
   */
  async execute(input) {
    this.validateInput(input);

    logger.debug('CreateBroker: executing', { brokerId: input.id });

    const broker = new Broker({
      id: input.id,
      displayName: input.displayName,
      type: input.type,
      accentColor: input.accentColor || null,
      notes: input.notes || null
    });

    const saved = await this._brokerRepository.save(broker);
    logger.info('Broker created', { brokerId: saved.idValue });
    return saved.toJSON();
  }
}

module.exports = CreateBroker;
