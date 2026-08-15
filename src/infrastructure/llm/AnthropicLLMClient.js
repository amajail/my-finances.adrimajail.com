/**
 * Anthropic LLM Client
 *
 * The single privacy boundary for runtime egress (feature 002).
 * Wraps `@anthropic-ai/sdk` to:
 *   - force structured output via `tool_use` with a `submit_analysis` tool;
 *   - enable prompt caching on the static metaprompt prefix (5-min ephemeral);
 *   - reject early if the input-token estimate exceeds the per-run cap;
 *   - validate the tool_use payload against the same JSON schema (defense-in-depth);
 *   - compute USD cost from per-model rates;
 *   - sanitize errors via LLMLogSanitizer before they bubble.
 *
 * The structured result is the ONLY thing this class returns. The raw request
 * messages and the raw response object never escape. Authorized by
 * constitution v1.1.0 Principle I carve-out.
 */

const ILLMClient = require('../../application/interfaces/ILLMClient');
const LLMLogSanitizer = require('./LLMLogSanitizer');
const logger = require('../../shared/logging');

/**
 * Per-model USD prices (per 1M tokens). Update when Anthropic changes pricing.
 * Keys are the model id strings; values are { input, output } in USD per 1M tokens.
 *
 * Source: platform.claude.com pricing (2026-07). The whole Opus 4.6/4.7/4.8
 * family is $5/$25 — the old $15/$75 here was Opus 4.0/4.1-era pricing and
 * overstated every stored costUsd ~3x. Sonnet 5 has an intro price ($2/$10
 * through 2026-08-31) not reflected here; we bill at the standard sticker so
 * the table isn't time-dependent (slight overstatement during the intro window).
 */
const MODEL_RATES = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

// Fallback for model ids not in the table: current Opus-tier pricing (the
// likeliest unknown id is a newer Opus/default-tier model, not a legacy one).
const DEFAULT_RATES = { input: 5, output: 25 };

class CostCapExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CostCapExceededError';
  }
}

class LLMSchemaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LLMSchemaValidationError';
  }
}

// Output hit max_tokens before the tool call finished — the tool input JSON is
// (at best) partial, so it must never reach schema validation as if complete.
class LLMTruncationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LLMTruncationError';
  }
}

class LLMRequestError extends Error {
  constructor(sanitized) {
    super(sanitized.message);
    this.name = 'LLMRequestError';
    this.sanitized = sanitized;
  }
}

class AnthropicLLMClient extends ILLMClient {
  /**
   * @param {Object} [deps={}]
   * @param {Object} [deps.sdkClient] - Optional pre-built Anthropic SDK client (for tests).
   * @param {string} [deps.apiKey] - Defaults to process.env.ANTHROPIC_API_KEY.
   */
  constructor({ sdkClient = null, apiKey = null } = {}) {
    super();
    this._sdkClient = sdkClient;
    this._apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  }

  _client() {
    if (this._sdkClient) return this._sdkClient;
    if (!this._apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    // Lazy require so test environments without the SDK installed still work
    // when an explicit sdkClient is injected.
    const Anthropic = require('@anthropic-ai/sdk');
    this._sdkClient = new Anthropic({ apiKey: this._apiKey });
    return this._sdkClient;
  }

  /**
   * @param {Object} input - See ILLMClient.submitAnalysis JSDoc.
   * @returns {Promise<{ summary: string, markdownBody: string, orders: Array, watchlist: Array|null, weekOverWeek: Array|null, frameworkAmendments: Array|null, usage: { inputTokens: number, outputTokens: number, costUsd: number } }>}
   */
  async submitAnalysis({ systemPrompt, userMessage, toolSchema, model, maxInputTokens, maxOutputTokens }) {
    if (!systemPrompt || !userMessage || !toolSchema || !model) {
      throw new Error('submitAnalysis: missing required input fields');
    }

    // Pre-call cost cap (heuristic: chars/4 with 20% safety margin).
    const estimatedInput = Math.ceil(((systemPrompt.length + userMessage.length) / 4) * 1.2);
    if (estimatedInput > maxInputTokens) {
      throw new CostCapExceededError(
        `pre-call estimate ${estimatedInput} tokens exceeds maxInputTokens=${maxInputTokens}`
      );
    }

    // One retry for a bad-but-recoverable response: a truncated output retries
    // with a doubled cap (max_tokens is a ceiling, not a spend — the retry only
    // costs what it generates); an invalid tool payload retries once with the
    // validation error fed back. The 5-min cached system prefix keeps the
    // retry's input cost low. Two attempts max — beyond that the failure is
    // persisted for the owner, not papered over.
    try {
      return await this._submitOnce({ systemPrompt, userMessage, toolSchema, model, maxOutputTokens });
    } catch (err) {
      const firstUsage = err.usage || { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      let retryInput = null;
      if (err instanceof LLMTruncationError) {
        retryInput = { systemPrompt, userMessage, toolSchema, model, maxOutputTokens: maxOutputTokens * 2 };
      } else if (err instanceof LLMSchemaValidationError) {
        retryInput = {
          systemPrompt,
          userMessage:
            `${userMessage}\n\n[RETRY] Your previous submission was rejected: ${err.message}. ` +
            'Call the tool again with every required field present and schema-valid.',
          toolSchema, model, maxOutputTokens,
        };
      }
      if (!retryInput) throw err;

      logger.warn('AnthropicLLMClient: submitAnalysis retrying once', {
        errorType: err.name,
        stopReason: err.stopReason || null,
        firstAttemptOutputTokens: firstUsage.outputTokens,
      });
      try {
        const result = await this._submitOnce(retryInput);
        return { ...result, usage: this._sumUsage(firstUsage, result.usage) };
      } catch (retryErr) {
        if (retryErr.usage) retryErr.usage = this._sumUsage(firstUsage, retryErr.usage);
        retryErr.attempts = 2;
        throw retryErr;
      }
    }
  }

  /**
   * Single submit attempt. Throws LLMRequestError (SDK), LLMTruncationError
   * (stop_reason=max_tokens), or LLMSchemaValidationError (bad payload) — the
   * latter two carry `.usage` and `.stopReason` so failures are diagnosable
   * from the persisted row.
   * @private
   */
  async _submitOnce({ systemPrompt, userMessage, toolSchema, model, maxOutputTokens }) {
    const client = this._client();
    const toolName = toolSchema.name || 'submit_analysis';

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxOutputTokens,
        // System prompt is cache-broken at its tail so retries within 5 minutes
        // reuse the cached prefix.
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [
          {
            name: toolName,
            description: toolSchema.description || 'Submit the structured weekly analysis result.',
            input_schema: toolSchema.input_schema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
        messages: [
          { role: 'user', content: userMessage },
        ],
      });
    } catch (err) {
      const sanitized = LLMLogSanitizer.sanitizeError(err);
      logger.error('AnthropicLLMClient: SDK request failed', sanitized);
      throw new LLMRequestError(sanitized);
    }

    const rawUsage = response.usage || { input_tokens: 0, output_tokens: 0 };
    const rates = MODEL_RATES[model] || DEFAULT_RATES;
    const usage = {
      inputTokens: rawUsage.input_tokens,
      outputTokens: rawUsage.output_tokens,
      costUsd: Number(
        ((rawUsage.input_tokens / 1_000_000) * rates.input +
          (rawUsage.output_tokens / 1_000_000) * rates.output).toFixed(4)
      ),
    };
    const stopReason = response.stop_reason || null;
    const failWith = (ErrClass, msg) => {
      const e = new ErrClass(msg);
      e.usage = usage;
      e.stopReason = stopReason;
      throw e;
    };

    // A max_tokens stop means the tool input JSON was cut mid-emission — treat
    // it as truncation, never as a schema problem.
    if (stopReason === 'max_tokens') {
      failWith(LLMTruncationError, `output truncated at max_tokens=${maxOutputTokens}`);
    }

    // Extract the tool_use block.
    const toolBlock = Array.isArray(response.content)
      ? response.content.find((b) => b.type === 'tool_use' && b.name === toolName)
      : null;
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== 'object') {
      failWith(LLMSchemaValidationError, `model did not return a "${toolName}" tool_use block`);
    }

    // Defense-in-depth: validate against the schema before persisting.
    try {
      this._validateAgainstSchema(toolBlock.input, toolSchema.input_schema);
    } catch (err) {
      if (err instanceof LLMSchemaValidationError) failWith(LLMSchemaValidationError, err.message);
      throw err;
    }

    return {
      summary: toolBlock.input.summary,
      markdownBody: toolBlock.input.markdownBody,
      orders: toolBlock.input.orders || [],
      // Feature 010: optional LLM-emitted structured sections. Absent → null
      // (the model omits the field when there is nothing to report → FR-008).
      watchlist: Array.isArray(toolBlock.input.watchlist) ? toolBlock.input.watchlist : null,
      weekOverWeek: Array.isArray(toolBlock.input.weekOverWeek) ? toolBlock.input.weekOverWeek : null,
      frameworkAmendments: Array.isArray(toolBlock.input.frameworkAmendments) ? toolBlock.input.frameworkAmendments : null,
      usage,
    };
  }

  _sumUsage(a, b) {
    return {
      inputTokens: (a.inputTokens || 0) + (b.inputTokens || 0),
      outputTokens: (a.outputTokens || 0) + (b.outputTokens || 0),
      costUsd: Number(((a.costUsd || 0) + (b.costUsd || 0)).toFixed(4)),
    };
  }

  /**
   * Small structured classification call (feature 006). Mirrors submitAnalysis'
   * tool_use pattern but is generic: forces a single tool, validates the input
   * against its schema, sanitizes SDK errors, and returns the tool input plus
   * usage/cost. Used for the IMF status classification (FR-022) — its input
   * carries ONLY public news text, never holdings data.
   *
   * @param {Object} input
   * @param {string} input.systemPrompt
   * @param {string} input.userMessage
   * @param {Object} input.toolSchema - { name, description, input_schema }.
   * @param {string} input.model
   * @param {number} input.maxOutputTokens
   * @returns {Promise<{ result: Object, usage: { inputTokens: number, outputTokens: number, costUsd: number } }>}
   */
  async classify({ systemPrompt, userMessage, toolSchema, model, maxOutputTokens }) {
    if (!systemPrompt || !userMessage || !toolSchema || !model) {
      throw new Error('classify: missing required input fields');
    }

    const client = this._client();
    const toolName = toolSchema.name || 'submit_classification';

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxOutputTokens || 256,
        system: [{ type: 'text', text: systemPrompt }],
        tools: [
          {
            name: toolName,
            description: toolSchema.description || 'Submit the classification result.',
            input_schema: toolSchema.input_schema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      const sanitized = LLMLogSanitizer.sanitizeError(err);
      logger.error('AnthropicLLMClient.classify: SDK request failed', sanitized);
      throw new LLMRequestError(sanitized);
    }

    const toolBlock = Array.isArray(response.content)
      ? response.content.find((b) => b.type === 'tool_use' && b.name === toolName)
      : null;
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== 'object') {
      throw new LLMSchemaValidationError(`model did not return a "${toolName}" tool_use block`);
    }

    this._validateAgainstSchema(toolBlock.input, toolSchema.input_schema);

    const usage = response.usage || { input_tokens: 0, output_tokens: 0 };
    const rates = MODEL_RATES[model] || DEFAULT_RATES;
    const costUsd = Number(
      ((usage.input_tokens / 1_000_000) * rates.input +
        (usage.output_tokens / 1_000_000) * rates.output).toFixed(6)
    );

    return {
      result: toolBlock.input,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        costUsd,
      },
    };
  }

  /**
   * Web-search-enabled structured classification (feature 006). Gives the model
   * Anthropic's server-side `web_search` tool plus a structured-output tool, lets
   * it research a public question, and returns the structured result. Used for
   * IMF status — the request carries ONLY a public macro question (no holdings).
   *
   * tool_choice is `auto` (the model must be free to search before submitting),
   * so we parse the structured tool_use block out of the final content.
   *
   * @param {Object} input
   * @param {string} input.systemPrompt
   * @param {string} input.userMessage
   * @param {Object} input.toolSchema - { name, description, input_schema }.
   * @param {string} input.model
   * @param {number} [input.maxOutputTokens]
   * @param {number} [input.maxSearches]
   * @returns {Promise<{ result: Object, usage: { inputTokens: number, outputTokens: number, costUsd: number } }>}
   */
  async classifyWithWebSearch({ systemPrompt, userMessage, toolSchema, model, maxOutputTokens, maxSearches }) {
    if (!systemPrompt || !userMessage || !toolSchema || !model) {
      throw new Error('classifyWithWebSearch: missing required input fields');
    }

    const client = this._client();
    const toolName = toolSchema.name || 'submit_classification';

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxOutputTokens || 1024,
        system: [{ type: 'text', text: systemPrompt }],
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches || 4 },
          {
            name: toolName,
            description: toolSchema.description || 'Submit the classification result.',
            input_schema: toolSchema.input_schema,
          },
        ],
        // Must be auto: the model has to be able to search before it submits.
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      const sanitized = LLMLogSanitizer.sanitizeError(err);
      logger.error('AnthropicLLMClient.classifyWithWebSearch: SDK request failed', sanitized);
      throw new LLMRequestError(sanitized);
    }

    const toolBlock = Array.isArray(response.content)
      ? response.content.find((b) => b.type === 'tool_use' && b.name === toolName)
      : null;
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== 'object') {
      throw new LLMSchemaValidationError(`model did not finish by calling "${toolName}"`);
    }

    this._validateAgainstSchema(toolBlock.input, toolSchema.input_schema);

    const usage = response.usage || { input_tokens: 0, output_tokens: 0 };
    const rates = MODEL_RATES[model] || DEFAULT_RATES;
    // Token cost only; the web-search server tool adds a small per-search fee
    // (~$0.01/search) that is not reflected in token counts.
    const costUsd = Number(
      ((usage.input_tokens / 1_000_000) * rates.input +
        (usage.output_tokens / 1_000_000) * rates.output).toFixed(6)
    );

    return {
      result: toolBlock.input,
      usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd },
    };
  }

  /**
   * Minimal JSON schema validator covering the subset our tool schema uses:
   * required fields, primitive types, enums, array minItems, string minLength.
   * Good enough for defense-in-depth — the model is the primary enforcer.
   *
   * @private
   */
  _validateAgainstSchema(value, schema) {
    const path = '$';
    const fail = (msg) => { throw new LLMSchemaValidationError(msg); };
    this._validateNode(value, schema, path, fail);
  }

  _validateNode(value, schema, path, fail) {
    if (!schema) return;
    if (schema.type === 'object') {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        fail(`${path}: expected object`);
      }
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        if (!(key in value)) fail(`${path}.${key}: required`);
      }
      const props = schema.properties || {};
      for (const key of Object.keys(value)) {
        if (props[key]) this._validateNode(value[key], props[key], `${path}.${key}`, fail);
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(value)) fail(`${path}: expected array`);
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
        fail(`${path}: minItems ${schema.minItems}, got ${value.length}`);
      }
      if (schema.items) {
        value.forEach((item, i) => this._validateNode(item, schema.items, `${path}[${i}]`, fail));
      }
    } else if (schema.type === 'string') {
      if (typeof value !== 'string') fail(`${path}: expected string`);
      if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
        fail(`${path}: minLength ${schema.minLength}, got ${value.length}`);
      }
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        fail(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
      }
    } else if (schema.type === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) fail(`${path}: expected number`);
      if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
        fail(`${path}: must be > ${schema.exclusiveMinimum}`);
      }
    }
  }
}

module.exports = AnthropicLLMClient;
module.exports.CostCapExceededError = CostCapExceededError;
module.exports.LLMSchemaValidationError = LLMSchemaValidationError;
module.exports.LLMTruncationError = LLMTruncationError;
module.exports.LLMRequestError = LLMRequestError;
