'use strict';

/**
 * Root ESLint flat config (ESLint 9) — covers the Azure Functions backend:
 * src/, tests/, scripts/. All CommonJS (see package.json "type": "commonjs").
 *
 * The dashboard/ Astro app has its own eslint.config.js (ESM + eslint-plugin-astro)
 * and is intentionally excluded here — it's a separate npm package with its own
 * node_modules and lint job in CI.
 *
 * Deliberately starts from `eslint:recommended` only. Stylistic/formatting rules
 * are left off on purpose (Prettier's job, not enabled repo-wide yet) to avoid a
 * mass-reformat diff while other branches are in flight.
 */

const js = require('@eslint/js');
const globals = require('globals');
const jestPlugin = require('eslint-plugin-jest');
const prettierConfig = require('eslint-config-prettier');

const unusedVarsRule = [
  'error',
  { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
];

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'dashboard/**', '.specify/**', 'specs/**'],
  },
  js.configs.recommended,
  // Root-level tooling config files (this file, jest.config.js, ...) — plain CommonJS.
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': unusedVarsRule,
    },
  },
  // Abstract base classes / repository interfaces: methods intentionally declare
  // parameters they don't use, purely to document the contract subclasses must
  // implement (each body just `throw`s "not implemented"). Real unused-vars bugs
  // are still caught everywhere else.
  {
    files: [
      'src/application/interfaces/**/*.js',
      'src/application/use-cases/UseCase.js',
      'src/shared/logging/Logger.js',
    ],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: { jest: jestPlugin },
    rules: {
      ...jestPlugin.configs['flat/recommended'].rules,
      'no-unused-vars': unusedVarsRule,
    },
  },
  // Custom assertion helpers call `expect()` outside of a test callback by
  // design (they're invoked from within `it()` blocks in other test files) —
  // jest/no-standalone-expect can't see through that indirection.
  {
    files: ['tests/helpers/**/*.js'],
    rules: {
      'jest/no-standalone-expect': 'off',
    },
  },
  prettierConfig,
];
