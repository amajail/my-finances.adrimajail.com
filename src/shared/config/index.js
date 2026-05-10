/**
 * Centralized Configuration Module
 *
 * This module provides a unified configuration interface for Azure Functions.
 * It loads environment-specific configuration and provides a single source of truth.
 */

require('dotenv').config();

const { get } = require('./helpers');
const environment = require('./environment');
const apiConfig = require('./api.config');

// ===== Core Shared Configuration =====

const shared = {
  // Application Settings
  app: {
    logLevel: get('LOG_LEVEL', 'info')
  }
};

// ===== Unified Configuration Export =====

const config = {
  // Spread shared configuration
  ...shared,

  // Environment utilities
  environment,

  // API-specific configuration (only loaded when in API context)
  api: environment.isAzureFunctions() ? apiConfig : null,

  // Helper methods for backward compatibility
  isTest() {
    return environment.isTest();
  },

  // Get runtime context
  getRuntimeContext() {
    return environment.getRuntimeContext();
  }
};

module.exports = config;
