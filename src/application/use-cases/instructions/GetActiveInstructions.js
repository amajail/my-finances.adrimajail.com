/**
 * GetActiveInstructions Use Case
 *
 * Returns the currently active instructions document along with the metadata
 * the editor UI needs to render (cap, last-updated, pointer back to history).
 *
 * Feature: 005-editable-metaprompt (spec FR-001, FR-010).
 */

const UseCase = require('../UseCase');
const InstructionsHistoryEntry = require('../../../domain/entities/InstructionsHistoryEntry');
const { NotFoundError } = require('../../../shared/errors');
const logger = require('../../../shared/logging');

class GetActiveInstructions extends UseCase {
  /**
   * @param {Object} deps
   * @param {IInstructionsRepository} deps.instructionsRepository
   */
  constructor({ instructionsRepository }) {
    super();
    this._instructionsRepository = instructionsRepository;
  }

  /**
   * @returns {Promise<{ content: string, historyRowKey: string|null, updatedAt: string|null, maxBytes: number }>}
   */
  async execute() {
    logger.debug('GetActiveInstructions: executing');

    const active = await this._instructionsRepository.getActive();
    if (!active) {
      throw new NotFoundError('instructions', 'analysis.instructionsV1');
    }

    return {
      content: active.content,
      historyRowKey: active.historyRowKey,
      updatedAt: active.updatedAt,
      maxBytes: InstructionsHistoryEntry.MAX_BYTES,
    };
  }
}

module.exports = GetActiveInstructions;
