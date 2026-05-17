/**
 * GetActiveFramework Use Case
 *
 * Returns the currently active strategic framework along with the metadata
 * the editor UI needs to render (cap, last-updated, pointer back to history).
 *
 * Feature: 004-editable-strategic-framework (spec FR-002, FR-013).
 */

const UseCase = require('../UseCase');
const FrameworkHistoryEntry = require('../../../domain/entities/FrameworkHistoryEntry');
const { NotFoundError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

class GetActiveFramework extends UseCase {
  /**
   * @param {Object} deps
   * @param {IFrameworkRepository} deps.frameworkRepository
   */
  constructor({ frameworkRepository }) {
    super();
    this._frameworkRepository = frameworkRepository;
  }

  /**
   * @returns {Promise<{ content: string, historyRowKey: string|null, updatedAt: string|null, maxBytes: number }>}
   */
  async execute() {
    logger.debug('GetActiveFramework: executing');

    const active = await this._frameworkRepository.getActive();
    if (!active) {
      throw new NotFoundError('strategic framework', 'analysis.strategicFrameworkV1');
    }

    return {
      content: active.content,
      historyRowKey: active.historyRowKey,
      updatedAt: active.updatedAt,
      maxBytes: FrameworkHistoryEntry.MAX_BYTES,
    };
  }
}

module.exports = GetActiveFramework;
