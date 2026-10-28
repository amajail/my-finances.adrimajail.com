/**
 * AnthropicLLMClient cost accounting, retry ceiling, classify stop_reason and
 * validator keyword coverage (system assessment 2026-10-28, findings #2-#6).
 */

const AnthropicLLMClient = require('../../../../src/infrastructure/llm/AnthropicLLMClient');
const { LLMTruncationError, LLMRequestError, LLMSchemaValidationError } = AnthropicLLMClient;
const TOOL_SCHEMA = require('../../../../src/application/use-cases/analysis/submit-analysis-tool.json');

const validInput = {
  summary: 'A perfectly reasonable executive summary paragraph, long enough.',
  markdownBody: 'B'.repeat(240),
  orders: [],
};
const toolResponse = (usage, extra = {}) => ({
  content: [{ type: 'tool_use', name: 'submit_analysis', input: validInput }],
  stop_reason: 'tool_use',
  usage,
  ...extra,
});
const truncated = (usage = { input_tokens: 1000, output_tokens: 8000 }) => ({
  content: [], stop_reason: 'max_tokens', usage,
});
const sdkWith = (...responses) => {
  const create = jest.fn();
  responses.forEach((r) => (r instanceof Error ? create.mockRejectedValueOnce(r) : create.mockResolvedValueOnce(r)));
  return { client: new AnthropicLLMClient({ sdkClient: { messages: { create } } }), create };
};
const input = (over = {}) => ({
  systemPrompt: 'sys', userMessage: 'msg', toolSchema: TOOL_SCHEMA,
  model: 'claude-opus-5', maxInputTokens: 80000, maxOutputTokens: 8000, ...over,
});

describe('cost accounting', () => {
  it('bills cache writes at 1.25x and reads at 0.1x, and counts them in inputTokens', async () => {
    const { client } = sdkWith(toolResponse({
      input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: 10000, output_tokens: 500,
    }));
    const { usage } = await client.submitAnalysis(input());
    expect(usage.inputTokens).toBe(13000);
    // $5/$25: 1000*5 + 2000*5*1.25 + 10000*5*0.1 + 500*25, per 1e6
    expect(usage.costUsd).toBeCloseTo(0.035, 4);
  });

  it('prices the newer model ids from the table, not the fallback', async () => {
    const { client } = sdkWith(toolResponse({ input_tokens: 1_000_000, output_tokens: 1_000_000 }));
    const { usage } = await client.submitAnalysis(input({ model: 'claude-opus-5-5' }));
    expect(usage.costUsd).toBe(24);
  });

  it('keeps the first attempt spend when the retry fails with LLMRequestError', async () => {
    const reqErr = new Error('boom');
    reqErr.status = 500;
    const { client } = sdkWith(truncated(), reqErr);
    const err = await client.submitAnalysis(input()).catch((e) => e);
    expect(err).toBeInstanceOf(LLMRequestError);
    expect(err.attempts).toBe(2);
    expect(err.usage.outputTokens).toBe(8000);
    expect(err.usage.costUsd).toBeGreaterThan(0);
  });
});

describe('truncation retry ceiling', () => {
  it('caps the doubled cap at 16000', async () => {
    const { client, create } = sdkWith(truncated(), toolResponse({ input_tokens: 10, output_tokens: 10 }));
    await client.submitAnalysis(input({ maxOutputTokens: 12000 }));
    expect(create.mock.calls[1][0].max_tokens).toBe(16000);
  });

  it('does not retry when the cap is already at the ceiling', async () => {
    const { client, create } = sdkWith(truncated());
    await expect(client.submitAnalysis(input({ maxOutputTokens: 16000 }))).rejects.toBeInstanceOf(LLMTruncationError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('classify stop_reason and usage on errors', () => {
  const tool = {
    name: 'submit_x',
    input_schema: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
  };
  const base = { systemPrompt: 's', userMessage: 'u', toolSchema: tool, model: 'claude-haiku-5-5' };

  it('throws LLMTruncationError carrying usage on max_tokens', async () => {
    const { client } = sdkWith({ content: [], stop_reason: 'max_tokens', usage: { input_tokens: 5, output_tokens: 6 } });
    const err = await client.classify(base).catch((e) => e);
    expect(err).toBeInstanceOf(LLMTruncationError);
    expect(err.usage.outputTokens).toBe(6);
  });

  it('throws on pause_turn from the web-search variant, with usage', async () => {
    const { client } = sdkWith({ content: [], stop_reason: 'pause_turn', usage: { input_tokens: 5, output_tokens: 6 } });
    const err = await client.classifyWithWebSearch(base).catch((e) => e);
    expect(err).toBeInstanceOf(LLMTruncationError);
    expect(err.usage.inputTokens).toBe(5);
  });

  it('adds the per-search fee to costUsd', async () => {
    const { client } = sdkWith({
      content: [{ type: 'tool_use', name: 'submit_x', input: { a: 'ok' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 3 } },
    });
    const { usage } = await client.classifyWithWebSearch(base);
    expect(usage.costUsd).toBeCloseTo(0.03, 6);
  });

  it('attaches usage to schema-validation failures', async () => {
    const { client } = sdkWith({
      content: [{ type: 'tool_use', name: 'submit_x', input: { a: 5 } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 7, output_tokens: 8 },
    });
    const err = await client.classify(base).catch((e) => e);
    expect(err).toBeInstanceOf(LLMSchemaValidationError);
    expect(err.usage.inputTokens).toBe(7);
  });
});

describe('schema validator keywords', () => {
  const v = new AnthropicLLMClient({ sdkClient: {} });
  const check = (value, schema) => v._validateAgainstSchema(value, schema);

  it.each([
    ['maxLength', { type: 'string', maxLength: 3 }, 'abcd'],
    ['maxItems', { type: 'array', maxItems: 1, items: { type: 'string' } }, ['a', 'b']],
    ['pattern', { type: 'string', pattern: '^[A-Z]+$' }, 'abc'],
    ['additionalProperties', { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } }, { a: 'x', b: 1 }],
    ['integer', { type: 'integer' }, 1.5],
    ['boolean', { type: 'boolean' }, 'true'],
    ['required null', { type: 'object', required: ['a'], properties: { a: { type: 'string' } } }, { a: null }],
    ['required undefined', { type: 'object', required: ['a'], properties: {} }, { a: undefined }],
  ])('rejects a %s violation', (_name, schema, value) => {
    expect(() => check(value, schema)).toThrow(LLMSchemaValidationError);
  });

  it('accepts conforming values', () => {
    expect(() => check({ a: 'ABC', n: 2, ok: true, l: ['x'] }, {
      type: 'object', additionalProperties: false, required: ['a'],
      properties: {
        a: { type: 'string', pattern: '^[A-Z]+$', maxLength: 3 },
        n: { type: 'integer' }, ok: { type: 'boolean' },
        l: { type: 'array', maxItems: 1, items: { type: 'string' } },
      },
    })).not.toThrow();
  });
});
