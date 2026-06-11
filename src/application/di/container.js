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
const AzureAnalysisRepository = require('../../infrastructure/repositories/AzureAnalysisRepository');
const AzureInstructionsRepository = require('../../infrastructure/repositories/AzureInstructionsRepository');

// Infrastructure providers
const { YahooFinancePriceProvider, CohenPriceProvider, IOLPriceProvider, PriceProviderRouter } = require('../../infrastructure/providers');
const ArgentinaDatosRiesgoPaisProvider = require('../../infrastructure/providers/ArgentinaDatosRiesgoPaisProvider');
const ArgentinaDatosMepProvider = require('../../infrastructure/providers/ArgentinaDatosMepProvider');

// Infrastructure LLM
const AnthropicLLMClient = require('../../infrastructure/llm/AnthropicLLMClient');

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
  RefreshPrices,
  GenerateWeeklyAnalysis,
  GetActiveInstructions,
  SaveInstructions,
  ListInstructionsHistory,
  GetInstructionsHistoryEntry,
  RestoreInstructionsVersion
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

  /**
   * Get AnalysisRepository instance (feature 002).
   * @returns {IAnalysisRepository}
   */
  getAnalysisRepository() {
    if (!this._singletons.has('analysisRepository')) {
      const repository = new AzureAnalysisRepository();
      this._singletons.set('analysisRepository', repository);
    }
    return this._singletons.get('analysisRepository');
  }

  /**
   * Get InstructionsRepository instance (feature 005).
   * @returns {IInstructionsRepository}
   */
  getInstructionsRepository() {
    if (!this._singletons.has('instructionsRepository')) {
      const repository = new AzureInstructionsRepository();
      this._singletons.set('instructionsRepository', repository);
    }
    return this._singletons.get('instructionsRepository');
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

  /**
   * Get ArgentinaDatosRiesgoPaisProvider instance (feature 002).
   * @returns {IRiesgoPaisProvider}
   */
  getRiesgoPaisProvider() {
    if (!this._singletons.has('riesgoPaisProvider')) {
      const provider = new ArgentinaDatosRiesgoPaisProvider();
      this._singletons.set('riesgoPaisProvider', provider);
    }
    return this._singletons.get('riesgoPaisProvider');
  }

  /**
   * Get ArgentinaDatosMepProvider instance — replaces the legacy `mep_rate`
   * portfolioSettings row. Fetches the dólar bolsa quote dynamically.
   * @returns {IMepProvider}
   */
  getMepProvider() {
    if (!this._singletons.has('mepProvider')) {
      const provider = new ArgentinaDatosMepProvider();
      this._singletons.set('mepProvider', provider);
    }
    return this._singletons.get('mepProvider');
  }

  // ==================== LLM ====================

  /**
   * Get AnthropicLLMClient instance (feature 002).
   * @returns {ILLMClient}
   */
  getLLMClient() {
    if (!this._singletons.has('llmClient')) {
      const client = new AnthropicLLMClient();
      this._singletons.set('llmClient', client);
    }
    return this._singletons.get('llmClient');
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
      priceRepository: this.getPriceRepository(),
      mepProvider: this.getMepProvider()
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

  // ==================== Analysis Use Cases (feature 002) ====================

  /**
   * Get GenerateWeeklyAnalysis use case (feature 002).
   * @returns {GenerateWeeklyAnalysis}
   */
  getGenerateWeeklyAnalysis() {
    return new GenerateWeeklyAnalysis({
      analysisRepository: this.getAnalysisRepository(),
      llmClient: this.getLLMClient(),
      riesgoPaisProvider: this.getRiesgoPaisProvider(),
      getPortfolioSummary: this.getGetPortfolioSummary(),
      settingsRepository: this.getSettingsRepository(),
      // Feature 005: the active instructions document is the AI system prompt
      // (used verbatim). Reading content + historyRowKey in one call preserves
      // snapshot-at-start (FR-012) and links each analysis to its source version.
      instructionsRepository: this.getInstructionsRepository()
    });
  }

  // ==================== Instructions Use Cases (feature 005) ====================

  /**
   * Get GetActiveInstructions use case (feature 005).
   * @returns {GetActiveInstructions}
   */
  getGetActiveInstructions() {
    return new GetActiveInstructions({
      instructionsRepository: this.getInstructionsRepository()
    });
  }

  /**
   * Get SaveInstructions use case (feature 005).
   * @returns {SaveInstructions}
   */
  getSaveInstructions() {
    return new SaveInstructions({
      instructionsRepository: this.getInstructionsRepository()
    });
  }

  /**
   * Get ListInstructionsHistory use case (feature 005).
   * @returns {ListInstructionsHistory}
   */
  getListInstructionsHistory() {
    return new ListInstructionsHistory({
      instructionsRepository: this.getInstructionsRepository()
    });
  }

  /**
   * Get GetInstructionsHistoryEntry use case (feature 005).
   * @returns {GetInstructionsHistoryEntry}
   */
  getGetInstructionsHistoryEntry() {
    return new GetInstructionsHistoryEntry({
      instructionsRepository: this.getInstructionsRepository()
    });
  }

  /**
   * Get RestoreInstructionsVersion use case (feature 005).
   * @returns {RestoreInstructionsVersion}
   */
  getRestoreInstructionsVersion() {
    return new RestoreInstructionsVersion({
      instructionsRepository: this.getInstructionsRepository(),
      saveInstructions: this.getSaveInstructions()
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
