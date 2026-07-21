/**
 * Refresh Prices Use Case
 *
 * Fetches current prices for all open positions across all brokers.
 * Records successful quotes and updates position prices.
 * Tracks failures separately without updating positions.
 */

const UseCase = require('../UseCase');
const logger = require('../../../shared/logging');
const safeAppendAudit = require('../audit/safeAppendAudit');

class RefreshPrices extends UseCase {
  /**
   * Create a new RefreshPrices use case
   * @param {Object} deps - Dependencies
   * @param {IPositionRepository} deps.positionRepository - Position repository
   * @param {IPriceRepository} deps.priceRepository - Price repository
   * @param {PriceProviderRouter} deps.priceProviderRouter - Provider router
   * @param {IAuditRepository} [deps.auditRepository] - Optional write-audit trail (feature 018)
   */
  constructor({ positionRepository, priceRepository, priceProviderRouter, auditRepository = null }) {
    super();
    this._positionRepository = positionRepository;
    this._priceRepository = priceRepository;
    this._priceProviderRouter = priceProviderRouter;
    this._auditRepository = auditRepository;
  }

  /**
   * Execute the use case
   * @param {Object} _input - { _audit? } (feature 018: optional audit context)
   * @returns {Promise<Object>} { totalSymbols, succeeded, failed, durationMs }
   */
  async execute(_input = {}) {
    const startTime = Date.now();
    logger.info('RefreshPrices: starting price refresh');

    let succeeded = 0;
    let failed = 0;

    try {
      // Load all open positions that can have prices quoted
      const positions = await this._positionRepository.findOpenWithPriceQuotable();
      if (!positions || positions.length === 0) {
        logger.info('RefreshPrices: no positions to refresh');
        await safeAppendAudit(this._auditRepository, {
          operation: 'price_refresh',
          targetType: 'prices',
          targetId: 'all-open',
          changes: [],
          details: { totalSymbols: 0, succeeded: 0, failed: 0 },
          confirmationUsed: false,
          source: (_input._audit && _input._audit.source) || 'api',
        });
        return { totalSymbols: 0, succeeded: 0, failed: 0, durationMs: Date.now() - startTime };
      }

      // Group positions by instrument identity (assetType, symbol). Two positions
      // with the same symbol but different asset types (e.g. an IBKR US stock and
      // a BullMarket CEDEAR sharing a ticker) are distinct instruments and must
      // be quoted independently.
      const instrumentMap = {};
      for (const pos of positions) {
        const key = `${pos.assetType}__${pos.symbol.value}`;
        if (!instrumentMap[key]) {
          instrumentMap[key] = {
            symbol: pos.symbol.value,
            assetType: pos.assetType,
            exchange: pos.exchange,
            currency: pos.currency,
            sample: pos
          };
        }
      }

      const totalSymbols = Object.keys(instrumentMap).length;
      logger.info('RefreshPrices: found instruments to refresh', { totalSymbols, positionCount: positions.length });

      // Process each instrument sequentially
      for (const [key, metadata] of Object.entries(instrumentMap)) {
        const { symbol, assetType, exchange, currency } = metadata;
        try {
          // Walk the provider chain — stop at first success.
          const chain = this._priceProviderRouter.chainFor(metadata.sample);
          if (!chain || chain.length === 0) {
            throw new Error(`No provider available for ${key}`);
          }

          let quote;
          let usedProvider;
          let lastErr;
          for (const provider of chain) {
            try {
              quote = await provider.getQuote({ symbol, assetType, exchange, currency });
              usedProvider = provider;
              break;
            } catch (err) {
              lastErr = err;
              logger.warn('RefreshPrices: provider attempt failed', { instrument: key, provider: provider.name, error: err.message });
            }
          }
          if (!quote) {
            throw lastErr || new Error(`All providers failed for ${key}`);
          }

          // Record successful quote
          const now = new Date();
          await this._priceRepository.recordQuote({
            symbol,
            price: quote.price,
            currency: quote.currency,
            provider: usedProvider.name,
            providerSymbol: quote.providerSymbol,
            fetchedAt: now,
            success: true
          });

          // Update only positions matching this (assetType, symbol) instrument.
          for (const pos of positions) {
            if (pos.assetType === assetType && pos.symbol.value === symbol) {
              const updatedPos = pos.withCurrentPrice(quote.price, now);
              await this._positionRepository.update(updatedPos);
            }
          }

          succeeded++;
          logger.debug('RefreshPrices: price updated', { instrument: key, price: quote.price, currency: quote.currency });

        } catch (err) {
          failed++;
          logger.warn('RefreshPrices: failed to fetch price', { instrument: key, error: err.message });

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
            logger.error('RefreshPrices: failed to record failed quote', { instrument: key, error: recordErr.message });
          }
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info('RefreshPrices: completed', { totalSymbols, succeeded, failed, durationMs });

      // Feature 018: record the refresh run in the audit trail (summary only —
      // per-position price changes are system-driven, not field-level edits).
      await safeAppendAudit(this._auditRepository, {
        operation: 'price_refresh',
        targetType: 'prices',
        targetId: 'all-open',
        changes: [],
        details: { totalSymbols, succeeded, failed },
        confirmationUsed: false,
        source: (_input._audit && _input._audit.source) || 'api',
      });

      return { totalSymbols, succeeded, failed, durationMs };

    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error('RefreshPrices: unexpected error', { error: err.message, durationMs });
      throw err;
    }
  }
}

module.exports = RefreshPrices;
