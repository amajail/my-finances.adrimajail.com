/**
 * Refresh Prices Use Case
 *
 * Fetches current prices for all open positions across all brokers.
 * Records successful quotes and updates position prices.
 * Tracks failures separately without updating positions.
 */

const UseCase = require('../UseCase');
const logger = require('../../../shared/logging');

class RefreshPrices extends UseCase {
  /**
   * Create a new RefreshPrices use case
   * @param {Object} deps - Dependencies
   * @param {IPositionRepository} deps.positionRepository - Position repository
   * @param {IPriceRepository} deps.priceRepository - Price repository
   * @param {PriceProviderRouter} deps.priceProviderRouter - Provider router
   */
  constructor({ positionRepository, priceRepository, priceProviderRouter }) {
    super();
    this._positionRepository = positionRepository;
    this._priceRepository = priceRepository;
    this._priceProviderRouter = priceProviderRouter;
  }

  /**
   * Execute the use case
   * @param {Object} input - {} (no input parameters currently used)
   * @returns {Promise<Object>} { totalSymbols, succeeded, failed, durationMs }
   */
  async execute(input = {}) {
    const startTime = Date.now();
    logger.info('RefreshPrices: starting price refresh');

    let succeeded = 0;
    let failed = 0;

    try {
      // Load all open positions that can have prices quoted
      const positions = await this._positionRepository.findOpenWithPriceQuotable();
      if (!positions || positions.length === 0) {
        logger.info('RefreshPrices: no positions to refresh');
        return { totalSymbols: 0, succeeded: 0, failed: 0, durationMs: Date.now() - startTime };
      }

      // Build a map of unique symbols with their metadata
      const symbolMap = {};
      for (const pos of positions) {
        const sym = pos.symbol.value;
        if (!symbolMap[sym]) {
          symbolMap[sym] = {
            exchange: pos.exchange,
            currency: pos.currency,
            assetType: pos.assetType,
            sample: pos
          };
        }
      }

      const totalSymbols = Object.keys(symbolMap).length;
      logger.info('RefreshPrices: found symbols to refresh', { totalSymbols, positionCount: positions.length });

      // Process each symbol sequentially
      for (const [symbol, metadata] of Object.entries(symbolMap)) {
        try {
          // Pick provider
          const provider = this._priceProviderRouter.pickFor(metadata.sample);

          // Fetch quote
          const quote = await provider.getQuote({
            symbol,
            assetType: metadata.assetType,
            exchange: metadata.exchange,
            currency: metadata.currency
          });

          // Record successful quote
          const now = new Date();
          await this._priceRepository.recordQuote({
            symbol,
            price: quote.price,
            currency: quote.currency,
            provider: provider.name,
            providerSymbol: quote.providerSymbol,
            fetchedAt: now,
            success: true
          });

          // Update all positions with this symbol
          for (const pos of positions) {
            if (pos.symbol.value === symbol) {
              const updatedPos = pos.withCurrentPrice(quote.price, now);
              await this._positionRepository.update(updatedPos);
            }
          }

          succeeded++;
          logger.debug('RefreshPrices: price updated', { symbol, price: quote.price, currency: quote.currency });

        } catch (err) {
          failed++;
          logger.warn('RefreshPrices: failed to fetch price', { symbol, error: err.message });

          // Record failed quote
          try {
            await this._priceRepository.recordQuote({
              symbol,
              price: null,
              currency: null,
              provider: 'unknown',
              providerSymbol: null,
              fetchedAt: new Date(),
              success: false,
              errorMessage: err.message
            });
          } catch (recordErr) {
            logger.error('RefreshPrices: failed to record failed quote', { symbol, error: recordErr.message });
          }
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info('RefreshPrices: completed', { totalSymbols, succeeded, failed, durationMs });

      return { totalSymbols, succeeded, failed, durationMs };

    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error('RefreshPrices: unexpected error', { error: err.message, durationMs });
      throw err;
    }
  }
}

module.exports = RefreshPrices;
