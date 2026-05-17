/**
 * Framework use-cases barrel.
 *
 * Feature: 004-editable-strategic-framework.
 */

const GetActiveFramework = require('./GetActiveFramework');
const SaveFramework = require('./SaveFramework');
const ListFrameworkHistory = require('./ListFrameworkHistory');
const GetFrameworkHistoryEntry = require('./GetFrameworkHistoryEntry');
const RestoreFrameworkVersion = require('./RestoreFrameworkVersion');

module.exports = {
  GetActiveFramework,
  SaveFramework,
  ListFrameworkHistory,
  GetFrameworkHistoryEntry,
  RestoreFrameworkVersion,
};
