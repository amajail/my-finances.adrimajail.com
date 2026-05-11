/**
 * Dependency Injection Container
 *
 * Centralizes the creation and wiring of dependencies for the application.
 * Follows Dependency Inversion Principle and enables easy testing.
 * Uses singleton pattern for repositories and providers.
 */

// Infrastructure repositories
const AzureBrokerRepository = require('../../infrastructure/repositories/AzureBrokerRepository');
const AzurePositionRepository = require('../../infrastructure/repositories/AzurePositionRepository');
const AzureSettingsRepository = require('../../infrastructure/repositories/AzureSettingsRepository');
const AzurePriceRepository = require('../../infrastructure/repositories/AzurePriceRepository');

// Infrastructure providers
const { YahooFinancePriceProvider, CohenPriceProvider, IOLPriceProvider, PriceProviderRouter } = require('../../infrastructure/providers');

// Use cases
const {
  ListBrokers,
  CreateBroker,
  ListPositions,
  AddPosition,
  UpdatePosition,
  DeletePosition,
  GetPortfolioSummary,
  GetSetting,
  UpdateSetting,
  RefreshPrices
} = require('../use-cases');

/**
 * Dependency Injection Container
 *
 * Manages dependency creation and lifecycle.
 */
class Container {
  constructor() {
    this._singletons = new Map();
  }

  // ==================== Repositories ====================

  /**
   * Get BrokerRepository instance
   * @returns {IBrokerRepository}
   */
  getBrokerRepository() {
    if (!this._singletons.has('brokerRepository')) {
      const repository = new AzureBrokerRepository();
      this._singletons.set('brokerRepository', repository);
    }
    return this._singletons.get('brokerRepository');
  }

  /**
   * Get PositionRepository instance
   * @returns {IPositionRepository}
   */
  getPositionRepository() {
    if (!this._singletons.has('positionRepository')) {
      const repository = new AzurePositionRepository();
      this._singletons.set('positionRepository', repository);
    }
    return this._singletons.get('positionRepository');
  }

  /**
   * Get SettingsRepository instance
   * @returns {ISettingsRepository}
   */
  getSettingsRepository() {
    if (!this._singletons.has('settingsRepository')) {
      const repository = new AzureSettingsRepository();
      this._singletons.set('settingsRepository', repository);
    }
    return this._singletons.get('settingsRepository');
  }

  /**
   * Get PriceRepository instance
   * @returns {IPriceRepository}
   */
  getPriceRepository() {
    if (!this._singletons.has('priceRepository')) {
      const repository = new AzurePriceRepository();
      this._singletons.set('priceRepository', repository);
    }
    return this._singletons.get('priceRepository');
  }

  // ==================== Providers ====================

  /**
   * Get YahooFinancePriceProvider instance
   * @returns {YahooFinancePriceProvider}
   */
  getYahooProvider() {
    if (!this._singletons.has('yahooProvider')) {
      const provider = new YahooFinancePriceProvider();
      this._singletons.set('yahooProvider', provider);
    }
    return this._singletons.get('yahooProvider');
  }

  /**
   * Get CohenPriceProvider instance
   * @returns {CohenPriceProvider}
   */
  getCohenProvider() {
    if (!this._singletons.has('cohenProvider')) {
      const provider = new CohenPriceProvider();
      this._singletons.set('cohenProvider', provider);
    }
    return this._singletons.get('cohenProvider');
  }

  /**
   * Get IOLPriceProvider instance
   * @returns {IOLPriceProvider}
   */
  getIOLProvider() {
    if (!this._singletons.has('iolProvider')) {
      const provider = new IOLPriceProvider();
      this._singletons.set('iolProvider', provider);
    }
    return this._singletons.get('iolProvider');
  }

  /**
   * Get PriceProviderRouter instance
   * @returns {PriceProviderRouter}
   */
  getPriceProviderRouter() {
    if (!this._singletons.has('priceProviderRouter')) {
      const router = new PriceProviderRouter({
        yahoo: this.getYahooProvider(),
        cohen: this.getCohenProvider(),
        iol: this.getIOLProvider()
      });
      this._singletons.set('priceProviderRouter', router);
    }
    return this._singletons.get('priceProviderRouter');
  }

  // ==================== Broker Use Cases ====================

  /**
   * Get ListBrokers use case
   * @returns {ListBrokers}
   */
  getListBrokers() {
    return new ListBrokers({
      brokerRepository: this.getBrokerRepository()
    });
  }

  /**
   * Get CreateBroker use case
   * @returns {CreateBroker}
   */
  getCreateBroker() {
    return new CreateBroker({
      brokerRepository: this.getBrokerRepository()
    });
  }

  // ==================== Position Use Cases ====================

  /**
   * Get ListPositions use case
   * @returns {ListPositions}
   */
  getListPositions() {
    return new ListPositions({
      positionRepository: this.getPositionRepository()
    });
  }

  /**
   * Get AddPosition use case
   * @returns {AddPosition}
   */
  getAddPosition() {
    return new AddPosition({
      brokerRepository: this.getBrokerRepository(),
      positionRepository: this.getPositionRepository()
    });
  }

  /**
   * Get UpdatePosition use case
   * @returns {UpdatePosition}
   */
  getUpdatePosition() {
    return new UpdatePosition({
      positionRepository: this.getPositionRepository()
    });
  }

  /**
   * Get DeletePosition use case
   * @returns {DeletePosition}
   */
  getDeletePosition() {
    return new DeletePosition({
      positionRepository: this.getPositionRepository()
    });
  }

  // ==================== Portfolio Use Cases ====================

  /**
   * Get GetPortfolioSummary use case
   * @returns {GetPortfolioSummary}
   */
  getGetPortfolioSummary() {
    return new GetPortfolioSummary({
      brokerRepository: this.getBrokerRepository(),
      positionRepository: this.getPositionRepository(),
      settingsRepository: this.getSettingsRepository(),
      priceRepository: this.getPriceRepository()
    });
  }

  // ==================== Settings Use Cases ====================

  /**
   * Get GetSetting use case
   * @returns {GetSetting}
   */
  getGetSetting() {
    return new GetSetting({
      settingsRepository: this.getSettingsRepository()
    });
  }

  /**
   * Get UpdateSetting use case
   * @returns {UpdateSetting}
   */
  getUpdateSetting() {
    return new UpdateSetting({
      settingsRepository: this.getSettingsRepository()
    });
  }

  // ==================== Price Use Cases ====================

  /**
   * Get RefreshPrices use case
   * @returns {RefreshPrices}
   */
  getRefreshPrices() {
    return new RefreshPrices({
      positionRepository: this.getPositionRepository(),
      priceRepository: this.getPriceRepository(),
      priceProviderRouter: this.getPriceProviderRouter()
    });
  }

  // ==================== Lifecycle ====================

  /**
   * Reset the container (useful for testing)
   */
  reset() {
    this._singletons.clear();
  }
}

// Export singleton instance
const container = new Container();

module.exports = container;
module.exports.Container = Container;
