/**
 * Azure Audit Repository (feature 018)
 *
 * Implementation of IAuditRepository on the append-only `portfolioAudit` table.
 *
 * Keying: single partition ('audit' — volume is tiny, human-driven writes) with
 * an inverted-millisecond-timestamp rowKey so Azure's native ascending rowKey
 * order returns newest entries first without any client-side sort. A short
 * random suffix keeps two writes in the same millisecond from colliding.
 *
 * Entries are immutable: `append` uses createEntity (never upsert), and no
 * update/delete methods exist by design (spec FR-001/FR-006).
 */

const AzureTableRepository = require('./AzureTableRepository');

const PARTITION = 'audit';
// 9_999_999_999_999 ms ≈ year 2286 — safely above any real epoch timestamp.
const EPOCH_CEILING_MS = 9999999999999;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * @implements {IAuditRepository}
 */
class AzureAuditRepository extends AzureTableRepository {
  /**
   * @param {AzureTableDatabase} [database=null] - Database instance; lazy-created when null.
   * @param {Object} [options]
   * @param {Function} [options.clock] - () => Date (injectable for tests).
   * @param {Function} [options.suffix] - () => string, 4-char uniqueness suffix (injectable for tests).
   */
  constructor(database = null, { clock = () => new Date(), suffix = defaultSuffix } = {}) {
    super(database, { alwaysInitializeProvidedDatabase: true });
    this._clock = clock;
    this._suffix = suffix;
  }

  /**
   * @param {import('../../application/interfaces/IAuditRepository').AuditEntry} entry
   * @returns {Promise<void>}
   */
  async append(entry) {
    await this._ensureInitialized();
    const now = this._clock();
    const entity = {
      partitionKey: PARTITION,
      rowKey: `${String(EPOCH_CEILING_MS - now.getTime()).padStart(13, '0')}-${this._suffix()}`,
      timestamp: entry.timestamp || now.toISOString(),
      operation: entry.operation,
      targetType: entry.targetType,
      targetId: entry.targetId,
      changes: JSON.stringify(entry.changes || []),
      details: entry.details ? JSON.stringify(entry.details) : '',
      confirmationUsed: entry.confirmationUsed === true,
      source: entry.source || 'api',
    };
    await this._run(
      () => this._database.auditClient.createEntity(entity),
      'Failed to append audit entry'
    );
  }

  /**
   * @param {number} [limit=20] - Clamped to 1..100.
   * @returns {Promise<Object[]>} Newest first.
   */
  async listRecent(limit = DEFAULT_LIMIT) {
    await this._ensureInitialized();
    const parsed = parseInt(limit, 10);
    const safeLimit = Number.isNaN(parsed)
      ? DEFAULT_LIMIT
      : Math.max(1, Math.min(MAX_LIMIT, parsed));

    return this._run(async () => {
      const entries = [];
      for await (const entity of this._database.auditClient.listEntities({
        queryOptions: { filter: `PartitionKey eq '${PARTITION}'` },
      })) {
        entries.push(this._fromEntity(entity));
        if (entries.length >= safeLimit) break;
      }
      return entries;
    }, 'Failed to list audit entries');
  }

  _fromEntity(entity) {
    return {
      timestamp: entity.timestamp,
      operation: entity.operation,
      targetType: entity.targetType,
      targetId: entity.targetId,
      changes: parseJson(entity.changes, []),
      details: entity.details ? parseJson(entity.details, null) : null,
      confirmationUsed: entity.confirmationUsed === true,
      source: entity.source || 'api',
    };
  }
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

function defaultSuffix() {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

module.exports = AzureAuditRepository;
