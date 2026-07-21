module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/test-setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/data/'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/cli.js',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Ratchet baseline, not an aspirational target: set a few points below the
  // actuals measured on 2026-07-21 (statements 67.63, branches 61.07,
  // functions 61.9, lines 67.92) so CI fails on real regressions but doesn't
  // block on day-to-day noise. Raise these as coverage genuinely improves.
  coverageThreshold: {
    global: {
      branches: 58,
      functions: 59,
      lines: 65,
      statements: 65
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
