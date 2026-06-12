/**
 * ILLMClient Interface
 *
 * The single privacy boundary for runtime egress to an external LLM service.
 * The implementation (AnthropicLLMClient) is the ONLY component that sees the
 * raw prompt and the raw model response; everything outside receives only the
 * structured analysis payload plus token/cost telemetry.
 *
 * Used by the GenerateWeeklyAnalysis use-case (feature 002). Authorized by
 * constitution v1.1.0 Principle I carve-out.
 */

/**
 * @typedef {Object} LLMSubmitInput
 * @property {string} systemPrompt - Static metaprompt; expected to be cache-broken at its tail.
 * @property {string} userMessage - Run-specific inputs (portfolio summary, previous analysis, riesgo país).
 * @property {Object} toolSchema - JSON schema for the `submit_analysis` tool (see contracts/submit-analysis-tool.json).
 * @property {string} model - Model identifier (e.g., "claude-opus-4-7").
 * @property {number} maxInputTokens - Hard cap; estimator-rejects before SDK call if breached.
 * @property {number} maxOutputTokens - Mapped to the SDK request's `max_tokens` field.
 */

/**
 * @typedef {Object} LLMUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} costUsd
 */

/**
 * @typedef {Object} LLMResult
 * @property {string} summary
 * @property {string} markdownBody
 * @property {Array<Object>} orders - Validated against toolSchema.
 * @property {LLMUsage} usage
 */

/**
 * @interface
 */
class ILLMClient {
  /**
   * Submit an analysis request. Returns structured output ONLY; the raw prompt
   * and raw response never leave this method.
   *
   * @param {LLMSubmitInput} input
   * @returns {Promise<LLMResult>}
   * @abstract
   */
  async submitAnalysis(_input) {
    throw new Error('Method not implemented: submitAnalysis');
  }

  /**
   * Small structured classification call (feature 006). Forces a single tool
   * and returns its validated input plus usage/cost. Used for IMF status
   * classification over PUBLIC news text only.
   *
   * @param {Object} input - { systemPrompt, userMessage, toolSchema, model, maxOutputTokens }
   * @returns {Promise<{ result: Object, usage: LLMUsage }>}
   * @abstract
   */
  async classify(_input) {
    throw new Error('Method not implemented: classify');
  }

  /**
   * Web-search-enabled structured classification (feature 006). Like classify(),
   * but gives the model a server-side web_search tool to research a PUBLIC
   * question before returning the structured result. No holdings are sent.
   *
   * @param {Object} input - { systemPrompt, userMessage, toolSchema, model, maxOutputTokens, maxSearches }
   * @returns {Promise<{ result: Object, usage: LLMUsage }>}
   * @abstract
   */
  async classifyWithWebSearch(_input) {
    throw new Error('Method not implemented: classifyWithWebSearch');
  }
}

module.exports = ILLMClient;
