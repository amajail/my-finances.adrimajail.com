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

module.exports = {
  AzureBrokerRepository,
  AzurePositionRepository,
  AzureSettingsRepository,
  AzurePriceRepository,
  AzureInstructionsRepository
};
