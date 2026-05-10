/**
 * Update Setting Use Case
 *
 * Updates or creates a setting in the repository.
 */

const UseCase = require('../UseCase');
const logger = require('../../../shared/logging');
const { ValidationError } = require('../../../shared/errors');

class UpdateSetting extends UseCase {
  /**
   * Create a new UpdateSetting use case
   * @param {Object} deps - Dependencies
   * @param {ISettingsRepository} deps.settingsRepository - Settings repository
   */
  constructor({ settingsRepository }) {
    super();
    this._settingsRepository = settingsRepository;
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
    if (!input.key || String(input.key).trim().length === 0) {
      errors.push({ field: 'key', message: 'key is required and cannot be empty' });
    }

    if (errors.length > 0) {
      throw ValidationError.fromFieldErrors(errors);
    }
  }

  /**
   * Execute the use case
   * @param {Object} input - { key, value }
   * @returns {Promise<Object>} { key, value }
   */
  async execute(input) {
    this.validateInput(input);

    logger.debug('UpdateSetting: executing', { key: input.key });

    await this._settingsRepository.set(input.key, input.value);
    logger.info('Setting updated', { key: input.key });

    return {
      key: input.key,
      value: input.value
    };
  }
}

module.exports = UpdateSetting;
