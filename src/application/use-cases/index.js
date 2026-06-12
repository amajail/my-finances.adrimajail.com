/**
 * Use Cases Barrel
 *
 * Centralized exports for all application use cases.
 */

const UseCase = require('./UseCase');

// Broker use cases
const { ListBrokers, CreateBroker } = require('./brokers');

// Position use cases
const { ListPositions, AddPosition, UpdatePosition, DeletePosition } = require('./positions');

// Portfolio use cases
const { GetPortfolioSummary } = require('./portfolio');

// Settings use cases
const { GetSetting, UpdateSetting } = require('./settings');

// Price use cases
const { RefreshPrices } = require('./prices');

// Analysis use cases
const GenerateWeeklyAnalysis = require('./analysis/GenerateWeeklyAnalysis');
const SetOrderExecutionStatus = require('./analysis/SetOrderExecutionStatus');
const GetSuggestionScorecard = require('./analysis/GetSuggestionScorecard');
const GetMacroSeries = require('./analysis/GetMacroSeries');

// Instructions use cases (feature 005)
const {
  GetActiveInstructions,
  SaveInstructions,
  ListInstructionsHistory,
  GetInstructionsHistoryEntry,
  RestoreInstructionsVersion,
} = require('./instructions');

module.exports = {
  UseCase,
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
  SetOrderExecutionStatus,
  GetSuggestionScorecard,
  GetMacroSeries,
  GetActiveInstructions,
  SaveInstructions,
  ListInstructionsHistory,
  GetInstructionsHistoryEntry,
  RestoreInstructionsVersion
};
