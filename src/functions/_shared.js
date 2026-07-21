/**
 * Shared utilities for Azure Functions handlers
 * Response helpers and error mapping
 */

const {
  AppError,
  ValidationError,
  NotFoundError,
  DomainError,
  InfrastructureError,
} = require('../shared/errors');

// CORS headers are injected by the Azure Function App platform CORS config
// (Function App → API → CORS). Returning them from code as well produces
// duplicated `Access-Control-Allow-Origin` headers which browsers reject.
function corsHeaders(extra = {}) {
  return { ...extra };
}

/**
 * Return a 200 OK response
 * @param {*} jsonBody - Response body
 * @param {Object} extraHeaders - Additional headers
 * @returns {Object} Azure Functions response
 */
function ok(jsonBody, extraHeaders = {}) {
  return { status: 200, jsonBody, headers: corsHeaders(extraHeaders) };
}

/**
 * Return a 201 Created response
 * @param {*} jsonBody - Response body
 * @returns {Object} Azure Functions response
 */
function created(jsonBody) {
  return { status: 201, jsonBody, headers: corsHeaders() };
}

/**
 * Return a 204 No Content response
 * @returns {Object} Azure Functions response
 */
function noContent() {
  return { status: 204, headers: corsHeaders() };
}

/**
 * Return an error response
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {Object} extra - Additional fields (e.g., details)
 * @returns {Object} Azure Functions response
 */
function fail(status, message, extra = {}) {
  return { status, jsonBody: { error: message, ...extra }, headers: corsHeaders() };
}

/**
 * Map application errors to HTTP responses
 * @param {Error} err - The error that occurred
 * @param {Object} context - Azure Functions context for logging
 * @returns {Object} Azure Functions response
 */
function mapError(err, context) {
  if (context?.log?.error) {
    context.log.error(err.message || String(err), err.stack || '');
  }

  if (err instanceof ValidationError) {
    return fail(400, err.message, { details: err.details || [] });
  }
  if (err instanceof NotFoundError) {
    return fail(404, err.message);
  }
  if (err instanceof DomainError) {
    return fail(422, err.message);
  }
  if (err instanceof InfrastructureError) {
    return fail(502, err.message);
  }
  if (err instanceof AppError) {
    return fail(err.statusCode || 500, err.message);
  }
  return fail(500, err?.message || 'Internal server error');
}

/**
 * Run a timer-trigger handler's task with the HTTP endpoints' consistency:
 * structured success/failure logging through the Azure Functions invocation
 * `context`, and a guarantee that the handler never throws — a timer failure
 * must not crash the host (Azure Functions timers otherwise mark the
 * function as failed and can affect host health).
 *
 * Logs exactly two messages, matching each timer's pre-refactor shape:
 *  - success: `context.log(`${label} complete`, formatSuccess(result))`
 *  - failure: `context.log.error(`${label} failed`, message)` where `message`
 *    is `err.message` when present, else `String(err)`.
 *
 * @param {Object} context - Azure Functions invocation context (`context.log`
 *   / `context.log.error`).
 * @param {string} label - Used to build the two log messages above.
 * @param {() => Promise<any>} task - The timer's actual work.
 * @param {(result: any) => any} [formatSuccess] - Maps the task's resolved
 *   value to what gets logged on success. Defaults to logging the value
 *   itself; pass a projection to log only a safe subset (e.g. omit payload
 *   fields that shouldn't hit logs).
 * @returns {Promise<any|undefined>} The task's result, or undefined if it threw.
 */
async function runTimer(context, label, task, formatSuccess = (result) => result) {
  try {
    const result = await task();
    context.log(`${label} complete`, formatSuccess(result));
    return result;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    context.log.error(`${label} failed`, message);
    return undefined;
  }
}

module.exports = { corsHeaders, ok, created, noContent, fail, mapError, runTimer };
