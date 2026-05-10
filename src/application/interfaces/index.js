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

module.exports = {
  IBrokerRepository,
  IPositionRepository,
  ISettingsRepository,
  IPriceRepository,
  IPriceProvider
};
