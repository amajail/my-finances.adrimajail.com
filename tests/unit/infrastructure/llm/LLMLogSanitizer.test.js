/**
 * LLMLogSanitizer tests
 */

const LLMLogSanitizer = require('../../../../src/infrastructure/llm/LLMLogSanitizer');

describe('LLMLogSanitizer', () => {
  it('returns only safe fields from an SDK-style error', () => {
    const sdkError = {
      status: 429,
      error: { type: 'rate_limit_error' },
      request_id: 'req_abc123',
      message: 'rate limit exceeded',
      // These fields MUST be scrubbed:
      request: {
        messages: [{ role: 'user', content: 'SECRET PORTFOLIO DATA HERE' }],
      },
      response: 'SECRET MODEL RESPONSE HERE',
      headers: { 'x-api-key': 'sk-ant-abc' },
    };

    const sanitized = LLMLogSanitizer.sanitizeError(sdkError);

    expect(sanitized).toEqual({
      status: 429,
      errorType: 'rate_limit_error',
      requestId: 'req_abc123',
      message: 'rate limit exceeded',
    });
    expect(Object.keys(sanitized)).toEqual(['status', 'errorType', 'requestId', 'message']);
    // No echoed payload anywhere:
    expect(JSON.stringify(sanitized)).not.toContain('SECRET');
    expect(JSON.stringify(sanitized)).not.toContain('sk-ant');
    expect(JSON.stringify(sanitized)).not.toContain('messages');
  });

  it('handles a vanilla Error instance', () => {
    const err = new Error('something broke');
    const sanitized = LLMLogSanitizer.sanitizeError(err);

    expect(sanitized.status).toBeNull();
    expect(sanitized.errorType).toBe('Error');
    expect(sanitized.requestId).toBeNull();
    expect(sanitized.message).toBe('something broke');
  });

  it('handles null / undefined', () => {
    expect(LLMLogSanitizer.sanitizeError(null)).toEqual({
      status: null,
      errorType: 'unknown',
      requestId: null,
      message: 'unknown error',
    });
    expect(LLMLogSanitizer.sanitizeError(undefined).errorType).toBe('unknown');
  });

  it('handles a plain string thrown', () => {
    const sanitized = LLMLogSanitizer.sanitizeError('something bad happened');
    expect(sanitized.message).toBe('something bad happened');
    expect(sanitized.errorType).toBe('unknown');
  });

  it('never includes any keys outside the safe list', () => {
    const sneaky = {
      status: 500,
      message: 'fail',
      sneaky_prompt: 'real holdings data',
      sneaky_response: 'real model response',
      __proto__: { polluted: true },
    };
    const sanitized = LLMLogSanitizer.sanitizeError(sneaky);
    const keys = Object.keys(sanitized);
    expect(keys.sort()).toEqual(['errorType', 'message', 'requestId', 'status']);
    expect(JSON.stringify(sanitized)).not.toContain('sneaky');
    expect(JSON.stringify(sanitized)).not.toContain('real holdings');
  });
});
