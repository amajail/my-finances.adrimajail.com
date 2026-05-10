/**
 * Base UseCase Class
 *
 * Abstract base class for all application use cases.
 * Follows the Command pattern and Clean Architecture principles.
 *
 * Usage:
 * class MyUseCase extends UseCase {
 *   async execute(input) {
 *     // Implementation
 *     return output;
 *   }
 * }
 */
class UseCase {
  /**
   * Execute the use case
   *
   * @abstract
   * @param {Object} input - Use case input parameters
   * @returns {Promise<Object>} Use case output
   * @throws {Error} If not implemented by subclass
   */
  async execute(input) {
    throw new Error(`execute() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Validate input parameters
   *
   * Override in subclasses for custom validation
   *
   * @protected
   * @param {Object} input - Input to validate
   * @throws {ValidationError} If validation fails
   */
  validateInput(input) {
    // Base validation - can be overridden
    if (input === null || input === undefined) {
      const { ValidationError } = require('../../shared/errors');
      throw new ValidationError('Input cannot be null or undefined');
    }
  }
}

module.exports = UseCase;
