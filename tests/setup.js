/**
 * Jest Setup File
 *
 * Global test configuration including mock implementations.
 */

// Set default environment variables for tests
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:4321';

// Mock the logging module to avoid Winston dependency in tests
jest.mock('../src/shared/logging', () => {
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
