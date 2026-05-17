/**
 * Get Portfolio Summary Use Case
 *
 * Retrieves a comprehensive summary of the portfolio including all metrics,
 * asset allocations, and performance data. Uses MEP rate for ARS to USD conversion.
 */

const UseCase = require('../UseCase');
const Portfolio = require('../../../domain/entities/Portfolio');
const PortfolioCalculator = require('../../../domain/services/PortfolioCalculator');
const logger = require('../../../shared/logging');

class GetPortfolioSummary extends UseCase {
  /**
   * Create a new GetPortfolioSummary use case
   * @param {Object} deps - Dependencies
   * @param {IBrokerRepository} deps.brokerRepository - Broker repository
   * @param {IPositionRepository} deps.positionRepository - Position repository
   * @param {IPriceRepository}    deps.priceRepository  - Price repository (last-refresh timestamp)
   * @param {IMepProvider}        deps.mepProvider      - MEP rate provider (replaces the legacy `mep_rate` setting)
   */
  constructor({ brokerRepository, positionRepository, priceRepository, mepProvider }) {
    super();
    this._brokerRepository = brokerRepository;
    this._positionRepository = positionRepository;
    this._priceRepository = priceRepository;
    this._mepProvider = mepProvider || null;
  }

  /**
   * Execute the use case
   * @param {Object} _input - Input (unused)
   * @returns {Promise<Object>} Portfolio summary with metrics and metadata
   */
  async execute(_input) {
    logger.debug('GetPortfolioSummary: executing');

    // Load brokers and open positions
    const brokers = await this._brokerRepository.findAll();
    const positions = await this._positionRepository.findAll({ status: 'open' });

    // Fetch the MEP rate from the configured provider (dólar bolsa via
    // api.argentinadatos.com). The legacy `mep_rate` portfolioSettings row
    // is no longer consulted; if a stale row still exists in the table it is
    // simply ignored. On provider failure we fall back to mepRate=1 (which
    // makes ARS positions value 1:1 to USD — obviously wrong, but matches
    // the historical behavior of "no usable MEP available, surface mepRate=1
    // in the output so the caller can see the degradation").
    let mepRate = 1;
    let mepRateAsOf = null;
    if (this._mepProvider) {
      try {
        const reading = await this._mepProvider.getLatest();
        if (reading && Number.isFinite(reading.rate) && reading.rate > 0) {
          mepRate = reading.rate;
          mepRateAsOf = reading.asOf || null;
        }
      } catch (err) {
        logger.warn('MEP provider failed, falling back to mepRate=1', { errorType: err && err.name });
      }
    } else {
      logger.warn('No MEP provider configured, using default mepRate=1');
    }

    // Get last price refresh timestamp
    let lastPriceRefreshAt = null;
    try {
      const recentQuotes = await this._priceRepository.getRecent(1);
      if (recentQuotes && recentQuotes.length > 0) {
        const successful = recentQuotes.find(q => q.success === true);
        if (successful) {
          lastPriceRefreshAt = successful.fetchedAt;
        }
      }
    } catch (err) {
      logger.warn('Failed to load last price refresh timestamp', err);
    }

    // Build portfolio
    const portfolio = new Portfolio(positions, brokers);

    // Calculate summary
    const calculator = new PortfolioCalculator(portfolio, mepRate);
    const summary = calculator.summary();

    logger.info('Portfolio summary generated', { mepRate, mepRateAsOf, positionCount: positions.length });

    return {
      ...summary,
      lastPriceRefreshAt,
      mepRate,
      mepRateAsOf
    };
  }
}

module.exports = GetPortfolioSummary;
