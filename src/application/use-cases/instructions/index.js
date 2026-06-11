/**
 * Instructions use-cases barrel.
 *
 * Feature: 005-editable-metaprompt.
 */

const GetActiveInstructions = require('./GetActiveInstructions');
const SaveInstructions = require('./SaveInstructions');
const ListInstructionsHistory = require('./ListInstructionsHistory');
const GetInstructionsHistoryEntry = require('./GetInstructionsHistoryEntry');
const RestoreInstructionsVersion = require('./RestoreInstructionsVersion');

module.exports = {
  GetActiveInstructions,
  SaveInstructions,
  ListInstructionsHistory,
  GetInstructionsHistoryEntry,
  RestoreInstructionsVersion,
};
