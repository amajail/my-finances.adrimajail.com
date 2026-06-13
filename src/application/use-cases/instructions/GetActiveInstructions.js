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
const { GUARDRAIL_PREAMBLE, EDITING_GUIDE } = require('../analysis/prompts/guardrails');
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
   * @returns {Promise<{ content: string, historyRowKey: string|null, updatedAt: string|null, maxBytes: number, preamble: string, editingGuide: string }>}
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
      // Feature 010 (FR-017): the fixed guardrail preamble (read-only — it is
      // prepended to `content` at run time to form the effective system prompt)
      // and the owner-facing editing guide. Both are committed, generic text.
      preamble: GUARDRAIL_PREAMBLE,
      editingGuide: EDITING_GUIDE,
    };
  }
}

module.exports = GetActiveInstructions;
