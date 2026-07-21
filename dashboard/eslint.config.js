// Dashboard ESLint flat config (ESLint 9). Separate from the root config
// because this is its own npm package (ESM, "type": "module") with its own
// node_modules and CI lint step.
//
// Starts from eslint-plugin-astro's recommended config for .astro files, plus
// eslint:recommended + browser/import.meta globals for the plain .js modules
// under src/lib. Stylistic rules are intentionally left off to avoid a
// mass-reformat diff (Prettier's job, not run repo-wide yet).

import js from '@eslint/js';
import astroPlugin from 'eslint-plugin-astro';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', '.astro/**'],
  },
  js.configs.recommended,
  ...astroPlugin.configs['flat/recommended'],
  {
    files: ['src/**/*.js', 'src/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['src/lib/charts.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  prettierConfig,
];
