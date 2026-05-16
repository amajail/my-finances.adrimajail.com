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
 */
const MODEL_RATES = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

const DEFAULT_RATES = { input: 15, output: 75 };

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
   * @returns {Promise<{ summary: string, markdownBody: string, orders: Array, usage: { inputTokens: number, outputTokens: number, costUsd: number } }>}
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

    // Extract the tool_use block.
    const toolBlock = Array.isArray(response.content)
      ? response.content.find((b) => b.type === 'tool_use' && b.name === toolName)
      : null;
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== 'object') {
      throw new LLMSchemaValidationError(
        `model did not return a "${toolName}" tool_use block`
      );
    }

    // Defense-in-depth: validate against the schema before persisting.
    this._validateAgainstSchema(toolBlock.input, toolSchema.input_schema);

    const usage = response.usage || { input_tokens: 0, output_tokens: 0 };
    const rates = MODEL_RATES[model] || DEFAULT_RATES;
    const costUsd = Number(
      ((usage.input_tokens / 1_000_000) * rates.input +
        (usage.output_tokens / 1_000_000) * rates.output).toFixed(4)
    );

    return {
      summary: toolBlock.input.summary,
      markdownBody: toolBlock.input.markdownBody,
      orders: toolBlock.input.orders || [],
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        costUsd,
      },
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
module.exports.LLMRequestError = LLMRequestError;
