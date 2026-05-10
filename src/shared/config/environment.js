/**
 * Environment Detection Module
 *
 * Provides utilities for detecting the current execution environment
 * and runtime context (API, CLI, test, etc.)
 */

/**
 * Get current Node environment
 */
function getNodeEnv() {
  return process.env.NODE_ENV || 'development';
}

/**
 * Check if running in production
 */
function isProduction() {
  return getNodeEnv() === 'production';
}

/**
 * Check if running in development
 */
function isDevelopment() {
  return getNodeEnv() === 'development';
}

/**
 * Check if running in test mode
 */
function isTest() {
  return getNodeEnv() === 'test';
}

/**
 * Check if running in Azure Functions
 * Azure Functions sets specific environment variables
 */
function isAzureFunctions() {
  return !!(
    process.env.WEBSITE_INSTANCE_ID ||
    process.env.AZURE_FUNCTIONS_ENVIRONMENT
  );
}

/**
 * Check if running in CLI mode
 * Determined by checking if process.stdin.isTTY exists
 * or if explicitly set via environment variable
 */
function isCLI() {
  return (
    process.env.EXECUTION_CONTEXT === 'cli' ||
    (!isAzureFunctions() && process.stdin && process.stdin.isTTY)
  );
}

/**
 * Get current runtime context
 * @returns {'api'|'cli'|'test'|'unknown'}
 */
function getRuntimeContext() {
  if (isTest()) return 'test';
  if (isAzureFunctions()) return 'api';
  if (isCLI()) return 'cli';
  return 'unknown';
}

module.exports = {
  getNodeEnv,
  isProduction,
  isDevelopment,
  isTest,
  isAzureFunctions,
  isCLI,
  getRuntimeContext
};
