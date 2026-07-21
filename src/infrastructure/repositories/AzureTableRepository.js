/**
 * Azure Table Repository (base class)
 *
 * Owns the mechanics that were genuinely duplicated, verbatim, across the
 * `Azure*Repository` implementations:
 *  - Lazy `AzureTableDatabase` acquisition + one-time `initialize()` (which
 *    creates every portfolio table if missing).
 *  - The "run this, and on a 404 statusCode return a fallback instead of
 *    throwing" shape used by every `findById`/`get`/`delete`.
 *  - The "run this, and on any error log + rethrow" shape used by every
 *    write/list method.
 *  - Collecting a `listEntities()` async iterator into an array of mapped
 *    domain values.
 *  - `createEntity` + 409-conflict → `InfrastructureError` (used by the two
 *    repositories that `save()` a brand-new row).
 *  - Resolving a value-object-or-plain-string id to its string value.
 *
 * Subclasses keep 100% of their entity<->domain mapping, bespoke queries, and
 * any method that intentionally does NOT wrap errors (a couple of read paths
 * in `AzureAnalysisRepository` never logged/wrapped errors before this
 * refactor, and still don't — see comments there).
 *
 * Two initialization behaviors existed across the original repositories, and
 * both are preserved exactly (selected via the `alwaysInitializeProvidedDatabase`
 * constructor option) rather than silently unified, since collapsing them
 * would be a (however minor) behavior change:
 *  - `false` (default — prior `AzureBrokerRepository` / `AzurePositionRepository`
 *    / `AzurePriceRepository` / `AzureSettingsRepository` behavior): when a
 *    database is injected via the constructor, `initialize()` is never called
 *    on it here (the caller is assumed to have handled that).
 *  - `true` (prior `AzureAnalysisRepository` / `AzureInstructionsRepository`
 *    behavior): `initialize()` is called exactly once regardless of whether
 *    the database was injected or lazily created.
 */

const logger = require('../../shared/logging');
const { InfrastructureError } = require('../../shared/errors');

class AzureTableRepository {
  /**
   * @param {AzureTableDatabase|null} [database=null] - Database instance;
   *   lazy-created when null.
   * @param {Object} [options]
   * @param {boolean} [options.alwaysInitializeProvidedDatabase=false] - See
   *   class docs above.
   */
  constructor(database = null, { alwaysInitializeProvidedDatabase = false } = {}) {
    this._database = database;
    this._initialized = false;
    this._alwaysInitializeProvidedDatabase = alwaysInitializeProvidedDatabase;
  }

  /**
   * @protected
   * @returns {Promise<void>}
   */
  async _ensureInitialized() {
    if (this._initialized) return;

    if (!this._database) {
      const AzureTableDatabase = require('../../database/AzureTableDatabase');
      this._database = new AzureTableDatabase();
      await this._database.initialize();
      this._initialized = true;
      return;
    }

    if (this._alwaysInitializeProvidedDatabase) {
      await this._database.initialize();
      this._initialized = true;
    }
  }

  /**
   * Run `fn`; on any error, log via `logger.error(errorMessage, error)` and
   * rethrow.
   * @protected
   * @param {() => Promise<any>} fn
   * @param {string} errorMessage
   * @returns {Promise<any>}
   */
  async _run(fn, errorMessage) {
    try {
      return await fn();
    } catch (error) {
      logger.error(errorMessage, error);
      throw error;
    }
  }

  /**
   * Run `fn`; on a 404 `statusCode` return `notFoundValue` (no error log).
   * On any other error, log via `logger.error(errorMessage, error)` and
   * rethrow.
   * @protected
   * @param {() => Promise<any>} fn
   * @param {*} notFoundValue
   * @param {string} errorMessage
   * @returns {Promise<any>}
   */
  async _withNotFound(fn, notFoundValue, errorMessage) {
    try {
      return await fn();
    } catch (error) {
      if (error.statusCode === 404) {
        return notFoundValue;
      }
      logger.error(errorMessage, error);
      throw error;
    }
  }

  /**
   * Collect a `listEntities()` async iterator into an array via `mapFn`. On
   * any error (including one thrown mid-iteration), log via
   * `logger.error(errorMessage, error)` and rethrow.
   * @protected
   * @param {AsyncIterable<Object>} iterable
   * @param {(entity: Object) => any} mapFn
   * @param {string} errorMessage
   * @returns {Promise<any[]>}
   */
  async _collect(iterable, mapFn, errorMessage) {
    const out = [];
    try {
      for await (const entity of iterable) {
        out.push(mapFn(entity));
      }
      return out;
    } catch (error) {
      logger.error(errorMessage, error);
      throw error;
    }
  }

  /**
   * `client.createEntity(entity)`; on a 409 conflict, log
   * `conflictLogMessage` and throw `InfrastructureError(conflictMessage)`. On
   * any other error, log `errorLogMessage` and rethrow.
   * @protected
   * @param {Object} client - Table client.
   * @param {Object} entity
   * @param {Object} messages
   * @param {string} messages.conflictMessage - `InfrastructureError` message.
   * @param {string} messages.conflictLogMessage
   * @param {string} messages.errorLogMessage
   * @returns {Promise<void>}
   */
  async _create(client, entity, { conflictMessage, conflictLogMessage, errorLogMessage }) {
    try {
      await client.createEntity(entity);
    } catch (error) {
      if (error.statusCode === 409) {
        logger.error(conflictLogMessage, error);
        throw new InfrastructureError(conflictMessage);
      }
      logger.error(errorLogMessage, error);
      throw error;
    }
  }

  /**
   * Resolve a value-object-or-string id to its plain string value.
   * @protected
   * @param {*} value
   * @param {Function} [ValueObjectClass] - Constructor to check `instanceof` against.
   * @returns {string}
   */
  _resolveId(value, ValueObjectClass) {
    if (ValueObjectClass && value instanceof ValueObjectClass) {
      return value.value;
    }
    return String(value);
  }
}

module.exports = AzureTableRepository;
