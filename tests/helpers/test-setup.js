// Global test setup and configuration
require('dotenv').config({ path: '.env.test' });

// Mock the logging module to avoid Winston dependency in tests
jest.mock('../../src/shared/logging', () => {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    logPortfolioUpdate: jest.fn(),
    logPortfolioUpdateFailure: jest.fn(),
    logDatabaseOperation: jest.fn(),
    logApiCall: jest.fn(),
    logStartup: jest.fn(),
    logShutdown: jest.fn(),
    default: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      http: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }
  };
});

// Polyfill globalThis.crypto for Node 18 (became a global in Node 19)
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

// Suppress console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  };
}

// Mock environment variables for testing
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:4321';

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
