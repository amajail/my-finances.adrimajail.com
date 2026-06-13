/**
 * Infrastructure Repositories Barrel
 *
 * Centralized exports for all repository implementations.
 */

const AzureBrokerRepository = require('./AzureBrokerRepository');
const AzurePositionRepository = require('./AzurePositionRepository');
const AzureSettingsRepository = require('./AzureSettingsRepository');
const AzurePriceRepository = require('./AzurePriceRepository');
const AzureInstructionsRepository = require('./AzureInstructionsRepository');
const AzureAllocationTargetsRepository = require('./AzureAllocationTargetsRepository');

module.exports = {
  AzureBrokerRepository,
  AzurePositionRepository,
  AzureSettingsRepository,
  AzurePriceRepository,
  AzureInstructionsRepository,
  AzureAllocationTargetsRepository
};
