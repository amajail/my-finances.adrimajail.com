/**
 * LLM Log Sanitizer
 *
 * The privacy boundary's outermost guard. Anthropic SDK errors can echo the
 * request payload (which contains real holdings) back in their `request`
 * property — this class extracts only safe metadata fields, dropping any
 * payload echo so it never reaches Application Insights or any other
 * operational log sink.
 *
 * Feature 002, spec FR-029. Constitution v1.1.0 Principle I carve-out.
 */

const SAFE_KEYS = ['status', 'errorType', 'requestId', 'message'];

class LLMLogSanitizer {
  /**
   * Extract only safe-to-log fields from an SDK error.
   *
   * @param {unknown} err - The error thrown by the Anthropic SDK (or any other source).
   * @returns {{ status: number|null, errorType: string, requestId: string|null, message: string }}
   */
  static sanitizeError(err) {
    const out = {
      status: null,
      errorType: 'unknown',
      requestId: null,
      message: 'unknown error',
    };

    if (!err) return out;

    // SDK errors carry `status`. Vanilla Errors do not.
    if (typeof err === 'object') {
      if ('status' in err && typeof err.status === 'number') {
        out.status = err.status;
      }
      if ('error' in err && err.error && typeof err.error === 'object' && typeof err.error.type === 'string') {
        out.errorType = err.error.type;
      } else if (typeof err.name === 'string') {
        out.errorType = err.name;
      }
      if (typeof err.request_id === 'string') {
        out.requestId = err.request_id;
      } else if (typeof err.requestId === 'string') {
        out.requestId = err.requestId;
      }
      if (typeof err.message === 'string') {
        out.message = err.message;
      } else {
        out.message = String(err);
      }
    } else if (typeof err === 'string') {
      out.message = err;
    } else {
      out.message = String(err);
    }

    // Final defensive filter: never let any other key bleed out.
    const filtered = {};
    for (const key of SAFE_KEYS) {
      filtered[key] = out[key];
    }
    return filtered;
  }
}

module.exports = LLMLogSanitizer;
