/**
 * ISettingsRepository Interface
 *
 * Repository interface for Settings persistence following Repository pattern.
 * Defines the contract for key-value settings data access operations.
 * Infrastructure layer will implement this interface.
 */

/**
 * Settings Repository Interface
 * @interface
 */
class ISettingsRepository {
  /**
   * Get a setting value by key
   * @param {string} key - Settings key
   * @returns {Promise<string|null>} Setting value or null if not found
   * @abstract
   */
  async get(key) {
    throw new Error('Method not implemented: get');
  }

  /**
   * Set a setting value by key
   * @param {string} key - Settings key
   * @param {string|number|boolean} value - Setting value
   * @returns {Promise<void>}
   * @abstract
   */
  async set(key, value) {
    throw new Error('Method not implemented: set');
  }

  /**
   * Get all settings as an object
   * @returns {Promise<Object>} Object with key-value pairs { [key]: value }
   * @abstract
   */
  async getAll() {
    throw new Error('Method not implemented: getAll');
  }
}

module.exports = ISettingsRepository;
