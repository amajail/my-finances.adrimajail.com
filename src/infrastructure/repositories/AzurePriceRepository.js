/**
 * Azure Price Repository
 *
 * Implementation of IPriceRepository using Azure Table Storage.
 * Handles persistence of price quotes with reverse-time ordering.
 *
 * @implements {IPriceRepository}
 */

const logger = require('../../shared/logging');
const AzureTableRepository = require('./AzureTableRepository');

class AzurePriceRepository extends AzureTableRepository {
  /**
   * Create a new AzurePriceRepository
   * @param {AzureTableDatabase} [database=null] - Database instance
   *                              If null, creates a new instance
   */
  constructor(database = null) {
    super(database);
  }

  /**
   * Record a new price quote
   * @param {Object} quote - Quote to record
   * @param {string} quote.symbol - Asset symbol/ticker
   * @param {number} quote.price - Quote price
   * @param {string} quote.currency - Currency of the price
   * @param {string} quote.provider - Data provider name
   * @param {string} [quote.providerSymbol] - Symbol used by the provider
   * @param {Date|string} quote.fetchedAt - When the quote was fetched
   * @param {boolean} quote.success - Whether the fetch was successful
   * @param {string} [quote.errorMessage] - Error message if unsuccessful
   * @returns {Promise<void>}
   */
  async recordQuote(quote) {
    await this._ensureInitialized();

    if (!quote.symbol || quote.symbol.trim().length === 0) {
      throw new Error('Quote symbol is required');
    }

    const symbol = String(quote.symbol).toUpperCase();
    const fetchedAt = new Date(quote.fetchedAt);
    const rowKey = this._generateRowKey(fetchedAt);

    const entity = {
      partitionKey: symbol,
      rowKey: rowKey,
      price: parseFloat(quote.price),
      currency: quote.currency,
      provider: quote.provider,
      providerSymbol: quote.providerSymbol || '',
      fetchedAt: fetchedAt.toISOString(),
      success: Boolean(quote.success),
      errorMessage: quote.errorMessage || ''
    };

    try {
      await this._database.pricesClient.createEntity(entity);
      logger.debug(`Price quote recorded: ${symbol} @ ${quote.price} ${quote.currency}`);
    } catch (error) {
      // On collision, append suffix and retry once (extremely rare)
      if (error.statusCode === 409) {
        entity.rowKey = rowKey + '_1';
        try {
          await this._database.pricesClient.createEntity(entity);
          logger.debug(`Price quote recorded (with collision suffix): ${symbol}`);
        } catch (retryError) {
          logger.error(`Failed to record price quote (even with suffix): ${symbol}`, retryError);
          throw retryError;
        }
      } else {
        logger.error(`Failed to record price quote: ${symbol}`, error);
        throw error;
      }
    }
  }

  /**
   * Get the latest successful quote for a symbol
   * @param {string} symbol - Asset symbol/ticker
   * @returns {Promise<Object|null>} Latest successful quote or null if none found
   */
  async getLatestForSymbol(symbol) {
    await this._ensureInitialized();

    const symbolUpper = String(symbol).toUpperCase();
    return this._run(async () => {
      const filter = `PartitionKey eq '${symbolUpper}' and success eq true`;
      for await (const entity of this._database.pricesClient.listEntities({ queryOptions: { filter } })) {
        // Since rowKey is reverse-time, first entity is latest
        return this._quoteFromEntity(entity);
      }
      logger.debug(`No successful quotes found for symbol: ${symbolUpper}`);
      return null;
    }, `Failed to get latest quote for symbol: ${symbolUpper}`);
  }

  /**
   * Get recent quotes across all symbols
   * Returns both successful and failed quotes, most recent first
   * @param {number} [limit=100] - Maximum number of quotes to return
   * @returns {Promise<Array>} Recent quotes
   */
  async getRecent(limit = 100) {
    await this._ensureInitialized();

    const quotes = await this._collect(
      this._database.pricesClient.listEntities(),
      (entity) => this._quoteFromEntity(entity),
      'Failed to get recent quotes'
    );

    // Sort by fetchedAt descending (most recent first)
    quotes.sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt));

    const result = quotes.slice(0, limit);
    logger.debug(`Retrieved ${result.length} recent quotes (from ${quotes.length} total)`);
    return result;
  }

  /**
   * Generate a reverse-time row key for sorting latest quotes first
   * @private
   * @param {Date} date - Date to convert
   * @returns {string} Reverse-time row key
   */
  _generateRowKey(date) {
    // Use BigInt to avoid precision loss with large numbers
    const maxTimestamp = 9999999999999n; // ~5138 AD in ms
    const timestamp = BigInt(date.getTime());
    const reverseTime = maxTimestamp - timestamp;
    return String(reverseTime).padStart(13, '0');
  }

  /**
   * Convert database entity to quote object
   * @private
   * @param {Object} entity - Database entity
   * @returns {Object} Quote object
   */
  _quoteFromEntity(entity) {
    return {
      symbol: entity.partitionKey,
      price: entity.price,
      currency: entity.currency,
      provider: entity.provider,
      providerSymbol: entity.providerSymbol || null,
      fetchedAt: entity.fetchedAt,
      success: entity.success,
      errorMessage: entity.errorMessage || null
    };
  }
}

module.exports = AzurePriceRepository;
