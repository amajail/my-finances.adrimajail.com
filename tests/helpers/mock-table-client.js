/**
 * Mock Table Client Helper
 *
 * Creates an in-memory mock of Azure Table Client for testing.
 * Supports createEntity, upsertEntity, getEntity, listEntities, deleteEntity operations.
 */

/**
 * Create a mock TableClient with in-memory storage
 * @returns {Object} Mock TableClient instance
 */
function createMockTableClient() {
  const entities = new Map(); // key: `${partitionKey}#${rowKey}`

  return {
    /**
     * Create a new entity (throws 409 on duplicate)
     */
    createEntity: jest.fn(async (entity) => {
      const key = `${entity.partitionKey}#${entity.rowKey}`;
      if (entities.has(key)) {
        const error = new Error('Entity already exists');
        error.statusCode = 409;
        throw error;
      }
      entities.set(key, JSON.parse(JSON.stringify(entity))); // Deep copy
      return entity;
    }),

    /**
     * Upsert an entity (create or replace/merge)
     */
    upsertEntity: jest.fn(async (entity, mode = 'Replace') => {
      const key = `${entity.partitionKey}#${entity.rowKey}`;
      if (mode === 'Replace') {
        entities.set(key, JSON.parse(JSON.stringify(entity)));
      } else if (mode === 'Merge') {
        const existing = entities.get(key) || {};
        const merged = { ...existing, ...entity };
        entities.set(key, merged);
      }
      return entity;
    }),

    /**
     * Get a single entity (throws 404 if not found)
     */
    getEntity: jest.fn(async (partitionKey, rowKey) => {
      const key = `${partitionKey}#${rowKey}`;
      const entity = entities.get(key);
      if (!entity) {
        const error = new Error('Entity not found');
        error.statusCode = 404;
        throw error;
      }
      return JSON.parse(JSON.stringify(entity)); // Deep copy
    }),

    /**
     * List entities (async iterable)
     * Supports optional filter in queryOptions.filter
     * Returns entities sorted by rowKey ascending (for reverse-time ordering, latest first)
     */
    listEntities: jest.fn(async function* (options = {}) {
      const filter = options.queryOptions?.filter;
      const matching = [];

      for (const entity of entities.values()) {
        if (filter) {
          if (!matchesFilter(entity, filter)) {
            continue;
          }
        }
        matching.push(entity);
      }

      // Sort by rowKey ascending (reverse-time: lower rowKeys = later timestamps = most recent)
      matching.sort((a, b) => a.rowKey.localeCompare(b.rowKey));

      for (const entity of matching) {
        yield JSON.parse(JSON.stringify(entity)); // Deep copy
      }
    }),

    /**
     * Delete an entity (throws 404 if not found)
     */
    deleteEntity: jest.fn(async (partitionKey, rowKey) => {
      const key = `${partitionKey}#${rowKey}`;
      if (!entities.has(key)) {
        const error = new Error('Entity not found');
        error.statusCode = 404;
        throw error;
      }
      entities.delete(key);
    }),

    /**
     * Get all entities for testing inspection
     */
    _getAllEntities: () => Array.from(entities.values())
  };
}

/**
 * Match an entity against a simple filter string
 * Supports basic filters like:
 *   - "PartitionKey eq 'value'"
 *   - "success eq true"
 *   - Complex: "PartitionKey eq 'value' and success eq true"
 * @private
 * @param {Object} entity - Entity to check
 * @param {string} filter - Filter string
 * @returns {boolean} Whether entity matches filter
 */
function matchesFilter(entity, filter) {
  // Split by 'and' for multiple conditions
  const conditions = filter.split(' and ').map(c => c.trim());

  for (const condition of conditions) {
    if (!matchesCondition(entity, condition)) {
      return false;
    }
  }
  return true;
}

/**
 * Match a single condition
 * @private
 * @param {Object} entity - Entity to check
 * @param {string} condition - Single condition like "PartitionKey eq 'value'"
 * @returns {boolean}
 */
function matchesCondition(entity, condition) {
  // Parse: "Field eq Value"
  const match = condition.match(/^(\w+)\s+eq\s+(.+)$/);
  if (!match) {
    return true; // Can't parse, assume match
  }

  const fieldName = match[1];
  const valueStr = match[2].trim();

  // Map field names
  const actualFieldName = fieldName === 'PartitionKey' ? 'partitionKey' : fieldName;

  // Parse value
  const value = parseFilterValue(valueStr);

  // Get entity value
  const entityValue = entity[actualFieldName];

  return entityValue === value;
}

/**
 * Parse a filter value (handles strings, booleans, etc.)
 * @private
 * @param {string} valueStr - String representation of value
 * @returns {*} Parsed value
 */
function parseFilterValue(valueStr) {
  // String in quotes
  if ((valueStr.startsWith("'") && valueStr.endsWith("'")) ||
      (valueStr.startsWith('"') && valueStr.endsWith('"'))) {
    return valueStr.slice(1, -1);
  }
  // Boolean
  if (valueStr === 'true') return true;
  if (valueStr === 'false') return false;
  // Number
  if (!isNaN(valueStr)) return Number(valueStr);
  return valueStr;
}

module.exports = {
  createMockTableClient
};
