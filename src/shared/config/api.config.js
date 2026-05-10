/**
 * Azure Functions API Configuration
 *
 * Configuration specific to Azure Functions runtime
 * and API-specific settings
 */

const { get, getInt, getBoolean } = require('./helpers');

module.exports = {
  // Azure Functions settings
  azure: {
    // Application Insights for monitoring
    applicationInsightsKey: get('APPINSIGHTS_INSTRUMENTATIONKEY', ''),

    // Function app settings
    functionTimeout: getInt('FUNCTION_TIMEOUT_MS', 300000), // 5 minutes
    maxConcurrentRequests: getInt('MAX_CONCURRENT_REQUESTS', 100),

    // Storage settings (for Azure Functions)
    storageConnectionString: get('AzureWebJobsStorage', ''),

    // Azure-specific environment variables
    websiteSiteName: get('WEBSITE_SITE_NAME', ''),
    websiteInstanceId: get('WEBSITE_INSTANCE_ID', ''),
    regionName: get('REGION_NAME', '')
  },

  // API-specific settings
  api: {
    // Authentication
    apiKeyHeader: get('API_KEY_HEADER', 'x-api-key'),
    requireAuth: getBoolean('API_REQUIRE_AUTH', true),
    allowedApiKeys: get('API_ALLOWED_KEYS', '').split(',').filter(k => k),

    // CORS settings
    corsEnabled: getBoolean('CORS_ENABLED', true),
    corsOrigins: get('CORS_ORIGINS', 'http://localhost:4321'),

    // Rate limiting
    rateLimitEnabled: getBoolean('RATE_LIMIT_ENABLED', true),
    rateLimitWindowMs: getInt('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
    rateLimitMaxRequests: getInt('RATE_LIMIT_MAX_REQUESTS', 100),

    // Response settings
    responseTimeout: getInt('API_RESPONSE_TIMEOUT_MS', 30000),
    maxResponseSize: getInt('API_MAX_RESPONSE_SIZE_BYTES', 5242880), // 5 MB

    // Pagination defaults
    defaultPageSize: getInt('API_DEFAULT_PAGE_SIZE', 20),
    maxPageSize: getInt('API_MAX_PAGE_SIZE', 100)
  },

  // Logging for API
  logging: {
    logLevel: get('API_LOG_LEVEL', 'info'),
    logRequests: getBoolean('API_LOG_REQUESTS', true),
    logResponses: getBoolean('API_LOG_RESPONSES', false),
    logErrors: getBoolean('API_LOG_ERRORS', true)
  }
};
