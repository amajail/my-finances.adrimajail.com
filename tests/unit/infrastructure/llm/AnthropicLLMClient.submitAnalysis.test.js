/**
 * AnthropicLLMClient.submitAnalysis retry/truncation tests.
 * Mocks the SDK client; asserts the single-retry policy: doubled max_tokens on
 * a max_tokens stop, validation feedback on a schema-invalid payload, usage
 * summed across attempts and attached to the final error.
 */

const AnthropicLLMClient = require('../../../../src/infrastructure/llm/AnthropicLLMClient');
const { LLMSchemaValidationError, LLMTruncationError, LLMRequestError } = AnthropicLLMClient;
const TOOL_SCHEMA = require('../../../../src/application/use-cases/analysis/submit-analysis-tool.json');

const longBody = 'B'.repeat(240);
const validInput = {
  summary: 'A perfectly reasonable executive summary paragraph, long enough.',
  markdownBody: longBody,
  orders: [],
};

function response({ content, stopReason = 'tool_use', usage = { input_tokens: 1000, output_tokens: 500 } }) {
  return { content, stop_reason: stopReason, usage };
}

const validResponse = (usage) => response({
  content: [{ type: 'tool_use', name: 'submit_analysis', input: validInput }],
  usage,
});

function clientWith(...responses) {
  const create = jest.fn();
  responses.forEach((r) => (r instanceof Error ? create.mockRejectedValueOnce(r) : create.mockResolvedValueOnce(r)));
  const sdkClient = { messages: { create } };
  return { client: new AnthropicLLMClient({ sdkClient }), create };
}

const baseInput = () => ({
  systemPrompt: 'You are the weekly analyst.',
  userMessage: 'Here is the portfolio.',
  toolSchema: TOOL_SCHEMA,
  model: 'claude-opus-4-8',
  maxInputTokens: 80000,
  maxOutputTokens: 8000,
});

describe('AnthropicLLMClient.submitAnalysis (retry policy)', () => {
  it('returns the result on a clean first attempt — no retry', async () => {
    const { client, create } = clientWith(validResponse());
    const result = await client.submitAnalysis(baseInput());

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.markdownBody).toBe(longBody);
    // Opus rates $5/$25 per 1M: 1000/1e6*5 + 500/1e6*25
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 500, costUsd: 0.0175 });
  });

  it('max_tokens stop → one retry with a doubled cap; usage summed across attempts', async () => {
    const truncated = response({
      content: [{ type: 'tool_use', name: 'submit_analysis', input: { summary: 'cut off mid emission but long enough to pass' } }],
      stopReason: 'max_tokens',
      usage: { input_tokens: 1000, output_tokens: 8000 },
    });
    const { client, create } = clientWith(truncated, validResponse({ input_tokens: 1000, output_tokens: 600 }));

    const result = await client.submitAnalysis(baseInput());

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].max_tokens).toBe(8000);
    expect(create.mock.calls[1][0].max_tokens).toBe(16000);
    expect(result.usage.inputTokens).toBe(2000);
    expect(result.usage.outputTokens).toBe(8600);
  });

  it('schema-invalid payload → one retry with the validation error fed back; cap unchanged', async () => {
    const missingBody = response({
      content: [{ type: 'tool_use', name: 'submit_analysis', input: { summary: validInput.summary, orders: [] } }],
    });
    const { client, create } = clientWith(missingBody, validResponse());

    const result = await client.submitAnalysis(baseInput());

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].max_tokens).toBe(8000);
    const retryMessage = create.mock.calls[1][0].messages[0].content;
    expect(retryMessage).toContain('[RETRY]');
    expect(retryMessage).toContain('$.markdownBody: required');
    expect(result.markdownBody).toBe(longBody);
    expect(result.usage.inputTokens).toBe(2000);
  });

  it('two truncated attempts → LLMTruncationError carrying summed usage, stopReason, attempts', async () => {
    const truncated = () => response({
      content: [],
      stopReason: 'max_tokens',
      usage: { input_tokens: 1000, output_tokens: 8000 },
    });
    const { client, create } = clientWith(truncated(), truncated());

    let caught;
    await client.submitAnalysis(baseInput()).catch((e) => { caught = e; });

    expect(caught).toBeInstanceOf(LLMTruncationError);
    expect(create).toHaveBeenCalledTimes(2);
    expect(caught.stopReason).toBe('max_tokens');
    expect(caught.attempts).toBe(2);
    expect(caught.usage.outputTokens).toBe(16000);
  });

  it('persistent schema failure → LLMSchemaValidationError with summed usage after exactly two attempts', async () => {
    const missingBody = () => response({
      content: [{ type: 'tool_use', name: 'submit_analysis', input: { summary: validInput.summary, orders: [] } }],
      usage: { input_tokens: 1000, output_tokens: 400 },
    });
    const { client, create } = clientWith(missingBody(), missingBody());

    let caught;
    await client.submitAnalysis(baseInput()).catch((e) => { caught = e; });

    expect(caught).toBeInstanceOf(LLMSchemaValidationError);
    expect(caught.message).toContain('$.markdownBody: required');
    expect(create).toHaveBeenCalledTimes(2);
    expect(caught.usage.outputTokens).toBe(800);
  });

  it('SDK errors are not retried', async () => {
    const { client, create } = clientWith(new Error('network blew up'));
    await expect(client.submitAnalysis(baseInput())).rejects.toBeInstanceOf(LLMRequestError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
