/**
 * Shared utilities for Azure Functions handlers
 * Response helpers and error mapping
 */

const { api: apiConfig } = require('../shared/config/api.config');
const {
  AppError,
  ValidationError,
  NotFoundError,
  DomainError,
  InfrastructureError,
} = require('../shared/errors');

/**
 * Generate CORS headers
 * @param {Object} extra - Additional headers to merge
 * @returns {Object} Headers object with CORS settings
 */
function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': apiConfig.corsOrigins,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-functions-key, x-api-key',
    ...extra,
  };
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

module.exports = { corsHeaders, ok, created, noContent, fail, mapError };
