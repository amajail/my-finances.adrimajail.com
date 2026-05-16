/**
 * Domain Entities
 *
 * Barrel export for all entities
 */

const Broker = require('./Broker');
const Position = require('./Position');
const Portfolio = require('./Portfolio');
const WeeklyAnalysis = require('./WeeklyAnalysis');
const SuggestedOrder = require('./SuggestedOrder');

module.exports = {
  Broker,
  Position,
  Portfolio,
  WeeklyAnalysis,
  SuggestedOrder
};
