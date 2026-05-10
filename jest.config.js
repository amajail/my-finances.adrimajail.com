module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/test-setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/data/'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/cli.js',
    '!src/index.js',
    '!src/functions/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
