/**
 * Get Setting Use Case
 *
 * Retrieves a setting from the repository by key.
 * Returns the value or null if not found.
 */

const UseCase = require('../UseCase');
const logger = require('../../../shared/logging');
const { ValidationError } = require('../../../shared/errors');

class GetSetting extends UseCase {
  /**
   * Create a new GetSetting use case
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

    if (!input.key) {
      throw new ValidationError('key is required', [{ field: 'key', message: 'key is required' }]);
    }
  }

  /**
   * Execute the use case
   * @param {Object} input - { key }
   * @returns {Promise<Object>} { key, value }
   */
  async execute(input) {
    this.validateInput(input);

    logger.debug('GetSetting: executing', { key: input.key });

    try {
      const value = await this._settingsRepository.get(input.key);
      logger.debug('Setting retrieved', { key: input.key, hasValue: value !== null && value !== undefined });
      return {
        key: input.key,
        value: value ?? null
      };
    } catch (err) {
      logger.warn('Failed to get setting', { key: input.key, error: err.message });
      return {
        key: input.key,
        value: null
      };
    }
  }
}

module.exports = GetSetting;
