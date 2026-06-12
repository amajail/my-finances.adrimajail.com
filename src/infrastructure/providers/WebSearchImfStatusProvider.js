/**
 * Web-Search IMF Status Provider (feature 006)
 *
 * Derives the IMF program review status for Argentina by letting the AI research
 * it live with Anthropic's server-side `web_search` tool, then return the fixed
 * status enum + as-of date (FR-007/FR-022). Replaces the brittle RSS-feed path:
 * there is no clean IMF per-country feed, but a web search reliably finds the
 * latest program-review news.
 *
 * Privacy: the request carries ONLY a public macro question — never holdings.
 *
 * Resilience: on AI/search failure, carry the prior reading forward if one
 * exists; otherwise throw ImfStatusFetchError so the orchestrator marks the
 * indicator unavailable (the run still completes).
 */

const IImfStatusProvider = require('../../application/interfaces/IImfStatusProvider');
const imfClassifyTool = require('../llm/imfClassifyTool');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_SEARCHES = 4;
const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

class ImfStatusFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'ImfStatusFetchError';
    if (cause) this.cause = cause;
  }
}

class WebSearchImfStatusProvider extends IImfStatusProvider {
  /**
   * @param {Object} deps
   * @param {Object} deps.llmClient - ILLMClient with classifyWithWebSearch().
   * @param {string} [deps.model]
   * @param {number} [deps.maxSearches]
   */
  constructor({ llmClient, model = DEFAULT_MODEL, maxSearches = DEFAULT_MAX_SEARCHES } = {}) {
    super();
    this._llmClient = llmClient;
    this._model = model;
    this._maxSearches = maxSearches;
  }

  async getLatest({ priorReading = null } = {}) {
    const systemPrompt =
      'You research the current IMF program review status for Argentina. Use the web_search ' +
      'tool to find the most recent, authoritative news (prefer IMF.org press releases). Then ' +
      'ALWAYS finish by calling the submit_imf_status tool with the status enum and the ISO date ' +
      'of the most recent relevant development. If you cannot determine a status, submit "unknown".';
    const userMessage =
      'What is the current status of Argentina\'s IMF program review (e.g. none, pending, ' +
      'staff-level agreement, board-approved, disbursement)? Search the web for the latest and ' +
      'submit the result.';

    try {
      const { result, usage } = await this._llmClient.classifyWithWebSearch({
        systemPrompt,
        userMessage,
        toolSchema: imfClassifyTool,
        model: this._model,
        maxOutputTokens: 1024,
        maxSearches: this._maxSearches,
      });
      return { status: result.status, asOf: result.asOf || null, usage: usage || { ...ZERO_USAGE } };
    } catch (err) {
      if (priorReading && priorReading.value) {
        return { status: priorReading.value, asOf: priorReading.asOf || null, usage: { ...ZERO_USAGE } };
      }
      throw new ImfStatusFetchError(
        `IMF status web-search failed and no prior reading to carry: ${err && err.message ? err.message : String(err)}`,
        err
      );
    }
  }
}

module.exports = WebSearchImfStatusProvider;
module.exports.ImfStatusFetchError = ImfStatusFetchError;
