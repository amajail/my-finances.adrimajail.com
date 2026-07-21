/**
 * Application Interfaces Barrel
 *
 * Centralized exports for all application-level interfaces.
 * These define contracts that must be implemented by the infrastructure layer.
 */

const IBrokerRepository = require('./IBrokerRepository');
const IPositionRepository = require('./IPositionRepository');
const ISettingsRepository = require('./ISettingsRepository');
const IPriceRepository = require('./IPriceRepository');
const IPriceProvider = require('./IPriceProvider');
const IAnalysisRepository = require('./IAnalysisRepository');
const ILLMClient = require('./ILLMClient');
const IRiesgoPaisProvider = require('./IRiesgoPaisProvider');
const IMepProvider = require('./IMepProvider');
const IInstructionsRepository = require('./IInstructionsRepository');
const IAllocationTargetsRepository = require('./IAllocationTargetsRepository');
const IAuditRepository = require('./IAuditRepository');

module.exports = {
  IBrokerRepository,
  IPositionRepository,
  ISettingsRepository,
  IPriceRepository,
  IPriceProvider,
  IAnalysisRepository,
  ILLMClient,
  IRiesgoPaisProvider,
  IMepProvider,
  IInstructionsRepository,
  IAllocationTargetsRepository,
  IAuditRepository
};
