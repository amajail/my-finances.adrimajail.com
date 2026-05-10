const AppError = require('./AppError');

/**
 * Not found error for missing resources
 * Used when a requested resource cannot be found
 */
class NotFoundError extends AppError {
  /**
   * @param {string} resourceType - Type of resource (e.g., 'Order', 'Invoice')
   * @param {string|number} identifier - Resource identifier
   * @param {Object} metadata - Additional context
   */
  constructor(resourceType, identifier, metadata = {}) {
    const message = `${resourceType} not found: ${identifier}`;
    super(message, 404, true, { ...metadata, resourceType, identifier }); // 404 Not Found
    this.resourceType = resourceType;
    this.identifier = identifier;
  }

  /**
   * Create NotFoundError for order
   */
  static order(orderNumber) {
    return new NotFoundError('Order', orderNumber);
  }

  /**
   * Create NotFoundError for invoice
   */
  static invoice(cae) {
    return new NotFoundError('Invoice', cae);
  }

  /**
   * Create NotFoundError with custom resource type
   */
  static resource(resourceType, identifier) {
    return new NotFoundError(resourceType, identifier);
  }
}

module.exports = NotFoundError;
