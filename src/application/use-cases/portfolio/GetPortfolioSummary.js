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
    // simply ignored.
    //
    // Degraded-FX contract (Slice D): on provider failure (or no provider)
    // the summary NEVER pretends ARS:USD is 1:1. Instead it carries
    // `fxDegraded: true` + `fxError`, reports `mepRate: null`, and every
    // USD-derived figure that would need the missing rate (`grandTotalUsd`,
    // per-broker `usdEquivalent`, ARS positions' `valueUsd`) is null — a
    // null total cannot be mistaken for healthy data, while a plausible 1:1
    // number can. Native-currency figures stay intact. No last-known-good
    // rate is stored anywhere, so none is invented here.
    let mepRate = null;
    let mepRateAsOf = null;
    let fxDegraded = true;
    let fxError = null;
    if (this._mepProvider) {
      try {
        const reading = await this._mepProvider.getLatest();
        if (reading && Number.isFinite(reading.rate) && reading.rate > 0) {
          mepRate = reading.rate;
          mepRateAsOf = reading.asOf || null;
          fxDegraded = false;
        } else {
          fxError = 'MEP provider returned no usable rate';
          logger.warn('MEP provider returned no usable rate; summary is FX-degraded');
        }
      } catch (err) {
        fxError = `MEP provider failed: ${(err && err.message) || String(err)}`;
        logger.warn('MEP provider failed; summary is FX-degraded', { errorType: err && err.name });
      }
    } else {
      fxError = 'no MEP provider configured';
      logger.warn('No MEP provider configured; summary is FX-degraded');
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

    // Calculate summary. PortfolioCalculator requires a positive rate, so on
    // the degraded path a placeholder of 1 keeps the native-currency math
    // running — every figure that placeholder touches is nulled out below,
    // so the 1:1 value never leaves this method.
    const calculator = new PortfolioCalculator(portfolio, fxDegraded ? 1 : mepRate);
    const summary = calculator.summary();
    if (fxDegraded) {
      summary.grandTotalUsd = null;
      summary.totalByBroker = Object.fromEntries(
        Object.entries(summary.totalByBroker).map(([brokerId, t]) => [
          brokerId,
          { ...t, usdEquivalent: null },
        ])
      );
    }

    // Per-position snapshot (feature 006). GenerateWeeklyAnalysis consumes this
    // via _snapshotFromSummary to capture the week's holdings and compute exact
    // week-over-week position changes. Shape must match the fields that
    // _snapshotFromSummary reads. valueUsd converts the native market value to
    // USD using the MEP rate (ARS only; other currencies are treated as USD).
    // When FX is degraded an ARS position's valueUsd is null (unknowable), not
    // a 1:1 guess.
    const positionSnapshot = positions.map((p) => {
      const mv = p.marketValue();
      const valueUsd = (mv === null || mv === undefined)
        ? 0
        : (p.currency === 'ARS' ? (fxDegraded ? null : mv / mepRate) : mv);
      return {
        brokerId: p.brokerId.value,
        assetType: p.assetType,
        symbol: p.symbol.value,
        quantity: p.quantity.value,
        averageCost: p.averageCost,
        currentPrice: p.currentPrice,
        currency: p.currency,
        valueUsd,
        status: p.status,
        // Feature 017: calendar derivation needs the maturity date and the
        // exchange (Yahoo symbol mapping). Additive — every existing consumer
        // whitelists the fields it reads.
        maturityDate: p.maturityDate || null,
        exchange: p.exchange || null
      };
    });

    logger.info('Portfolio summary generated', { mepRate, mepRateAsOf, fxDegraded, positionCount: positions.length });

    return {
      ...summary,
      positions: positionSnapshot,
      lastPriceRefreshAt,
      mepRate,
      mepRateAsOf,
      // Degraded-FX signal, consumed by GenerateWeeklyAnalysis (refuses) and
      // by the monthly-close routine (M1) per dev-kit docs/mcp-contracts.md.
      fxDegraded,
      fxError
    };
  }
}

module.exports = GetPortfolioSummary;
