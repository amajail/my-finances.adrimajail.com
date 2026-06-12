/**
 * AnthropicLLMClient.classify tests (feature 006, FR-022).
 * Mocks the SDK client; asserts forced tool, schema validation, usage/cost.
 */

const AnthropicLLMClient = require('../../../../src/infrastructure/llm/AnthropicLLMClient');
const { LLMSchemaValidationError, LLMRequestError } = AnthropicLLMClient;
const imfClassifyTool = require('../../../../src/infrastructure/llm/imfClassifyTool');

function sdkReturning(content, usage = { input_tokens: 150, output_tokens: 15 }) {
  return { messages: { create: jest.fn().mockResolvedValue({ content, usage }) } };
}

const baseInput = () => ({
  systemPrompt: 'Classify IMF status from public news only.',
  userMessage: '## IMF/Argentina news\n1. [2026-06-10] IMF completes review',
  toolSchema: imfClassifyTool,
  model: 'claude-haiku-4-5-20251001',
  maxOutputTokens: 256,
});

describe('AnthropicLLMClient.classify', () => {
  it('returns the validated tool input and computed usage/cost', async () => {
    const sdkClient = sdkReturning([
      { type: 'tool_use', name: 'submit_imf_status', input: { status: 'approved', asOf: '2026-06-10' } },
    ]);
    const client = new AnthropicLLMClient({ sdkClient });

    const { result, usage } = await client.classify(baseInput());

    expect(result.status).toBe('approved');
    expect(usage.inputTokens).toBe(150);
    expect(usage.outputTokens).toBe(15);
    // Haiku rates: $1/1M in, $5/1M out → 150/1e6*1 + 15/1e6*5
    expect(usage.costUsd).toBeCloseTo(0.000225, 6);

    const call = sdkClient.messages.create.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'submit_imf_status' });
  });

  it('throws LLMSchemaValidationError when the status is not in the enum', async () => {
    const sdkClient = sdkReturning([
      { type: 'tool_use', name: 'submit_imf_status', input: { status: 'totally-made-up', asOf: '2026-06-10' } },
    ]);
    await expect(new AnthropicLLMClient({ sdkClient }).classify(baseInput())).rejects.toBeInstanceOf(LLMSchemaValidationError);
  });

  it('throws LLMSchemaValidationError when no tool_use block is returned', async () => {
    const sdkClient = sdkReturning([{ type: 'text', text: 'no tool here' }]);
    await expect(new AnthropicLLMClient({ sdkClient }).classify(baseInput())).rejects.toBeInstanceOf(LLMSchemaValidationError);
  });

  it('wraps SDK errors as a sanitized LLMRequestError', async () => {
    const sdkClient = { messages: { create: jest.fn().mockRejectedValue(new Error('network blew up')) } };
    await expect(new AnthropicLLMClient({ sdkClient }).classify(baseInput())).rejects.toBeInstanceOf(LLMRequestError);
  });
});
