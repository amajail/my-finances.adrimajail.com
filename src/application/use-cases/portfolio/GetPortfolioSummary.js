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
   * @param {ISettingsRepository} deps.settingsRepository - Settings repository
   * @param {IPriceRepository} deps.priceRepository - Price repository
   */
  constructor({ brokerRepository, positionRepository, settingsRepository, priceRepository }) {
    super();
    this._brokerRepository = brokerRepository;
    this._positionRepository = positionRepository;
    this._settingsRepository = settingsRepository;
    this._priceRepository = priceRepository;
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

    // Load MEP rate setting
    let mepRate = 1;
    try {
      const setting = await this._settingsRepository.get('mep_rate');
      if (setting && setting.value) {
        mepRate = parseFloat(setting.value);
        if (isNaN(mepRate) || mepRate <= 0) {
          mepRate = 1;
        }
      }
    } catch (err) {
      logger.warn('Failed to load mep_rate setting, using default 1', err);
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

    logger.info('Portfolio summary generated', { mepRate, positionCount: positions.length });

    return {
      ...summary,
      lastPriceRefreshAt,
      mepRate
    };
  }
}

module.exports = GetPortfolioSummary;
