/**
 * ListFrameworkHistory Use Case
 *
 * Returns framework history rows in newest-first order. The repository
 * already returns rows in that order (descending-timestamp rowKey, see
 * research R1) and replaces `content` with `contentBytes` to keep the
 * list payload small.
 *
 * Feature: 004-editable-strategic-framework (spec FR-006, FR-013).
 */

const UseCase = require('../UseCase');
const { ValidationError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

class ListFrameworkHistory extends UseCase {
  /**
   * @param {Object} deps
   * @param {IFrameworkRepository} deps.frameworkRepository
   */
  constructor({ frameworkRepository }) {
    super();
    this._frameworkRepository = frameworkRepository;
  }

  /**
   * @param {Object} [input]
   * @param {number} [input.limit]
   * @returns {Promise<{ entries: Array<Object>, count: number }>}
   */
  async execute({ limit } = {}) {
    let safeLimit = DEFAULT_LIMIT;
    if (limit !== undefined && limit !== null && limit !== '') {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
        throw new ValidationError(`limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`, [
          { field: 'limit', message: `must be an integer in [${MIN_LIMIT}, ${MAX_LIMIT}]` },
        ]);
      }
      safeLimit = n;
    }

    logger.debug('ListFrameworkHistory: executing', { limit: safeLimit });

    const rows = await this._frameworkRepository.listHistory({ limit: safeLimit });
    const entries = rows.map((r) => ({
      rowKey: r.id,
      timestamp: r.timestamp,
      changeNote: r.changeNote ?? null,
      source: r.source,
      restoreOfRowKey: r.restoreOfRowKey ?? null,
      contentBytes: r.contentBytes,
    }));

    return { entries, count: entries.length };
  }
}

module.exports = ListFrameworkHistory;
