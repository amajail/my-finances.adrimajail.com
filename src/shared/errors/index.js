/**
 * Centralized export for all error classes
 */

const AppError = require('./AppError');
const DomainError = require('./DomainError');
const ValidationError = require('./ValidationError');
const InfrastructureError = require('./InfrastructureError');
const NotFoundError = require('./NotFoundError');

module.exports = {
  AppError,
  DomainError,
  ValidationError,
  InfrastructureError,
  NotFoundError
};
