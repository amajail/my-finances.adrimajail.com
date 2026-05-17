/**
 * Azure Table Database Wrapper
 *
 * Small connection class that creates TableClient instances for all portfolio entities.
 * Handles table initialization and provides access to underlying clients.
 */

const { TableClient } = require('@azure/data-tables');

class AzureTableDatabase {
  /**
   * Create a new AzureTableDatabase instance
   * @param {string} [connectionString=null] - Azure Storage connection string
   *                 If not provided, will use AZURE_STORAGE_CONNECTION_STRING environment variable
   * @throws {Error} If connection string is not available
   */
  constructor(connectionString = null) {
    const connStr = connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is required');
    }

    this.brokersClient = TableClient.fromConnectionString(connStr, 'portfolioBrokers');
    this.positionsClient = TableClient.fromConnectionString(connStr, 'portfolioPositions');
    this.settingsClient = TableClient.fromConnectionString(connStr, 'portfolioSettings');
    this.pricesClient = TableClient.fromConnectionString(connStr, 'portfolioPrices');
    this.analysisClient = TableClient.fromConnectionString(connStr, 'portfolioAnalysis');
    this.ordersClient = TableClient.fromConnectionString(connStr, 'portfolioOrders');
    this.frameworkHistoryClient = TableClient.fromConnectionString(connStr, 'portfolioFrameworkHistory');
  }

  /**
   * Initialize all tables (create if not exists)
   * @returns {Promise<void>}
   */
  async initialize() {
    const clients = [
      this.brokersClient,
      this.positionsClient,
      this.settingsClient,
      this.pricesClient,
      this.analysisClient,
      this.ordersClient,
      this.frameworkHistoryClient
    ];

    for (const client of clients) {
      try {
        await client.createTable();
      } catch (error) {
        // Ignore 409 Conflict - table already exists
        if (error.statusCode !== 409) {
          throw error;
        }
      }
    }
  }

  /**
   * Close database connection (no-op for Azure Table Storage)
   * @returns {Promise<void>}
   */
  async close() {
    // No explicit connection to close for Azure Table Storage
  }
}

module.exports = AzureTableDatabase;
