/**
 * AzureTableRepository (base class) unit tests.
 *
 * Covers the mechanics extracted from the concrete Azure*Repository classes:
 * lazy database initialization (both initialization modes), the 404-fallback
 * wrapper, the generic run-and-log wrapper, listEntities collection, the
 * create-or-conflict helper, and value-object id resolution. The concrete
 * repositories' own test suites cover these indirectly; this file pins the
 * base class's own contract directly.
 */

const AzureTableRepository = require('../../../../src/infrastructure/repositories/AzureTableRepository');
const { InfrastructureError } = require('../../../../src/shared/errors');

describe('AzureTableRepository', () => {
  describe('_ensureInitialized', () => {
    it('lazily creates and initializes AzureTableDatabase when no database is provided', async () => {
      jest.resetModules();
      jest.doMock('../../../../src/database/AzureTableDatabase', () => {
        return jest.fn().mockImplementation(() => ({
          initialize: jest.fn().mockResolvedValue(undefined),
        }));
      });
      const AzureTableDatabase = require('../../../../src/database/AzureTableDatabase');
      const AzureTableRepositoryFresh = require('../../../../src/infrastructure/repositories/AzureTableRepository');

      const repo = new AzureTableRepositoryFresh();
      await repo._ensureInitialized();

      expect(AzureTableDatabase).toHaveBeenCalledTimes(1);
      expect(repo._database.initialize).toHaveBeenCalledTimes(1);

      await repo._ensureInitialized();
      expect(repo._database.initialize).toHaveBeenCalledTimes(1);

      jest.dontMock('../../../../src/database/AzureTableDatabase');
      jest.resetModules();
    });

    it('default mode (alwaysInitializeProvidedDatabase=false): never calls initialize() on an injected database', async () => {
      const db = {}; // no initialize() at all — would throw if ever called
      const repo = new AzureTableRepository(db);
      await expect(repo._ensureInitialized()).resolves.toBeUndefined();
      await expect(repo._ensureInitialized()).resolves.toBeUndefined();
      expect(repo._database).toBe(db);
    });

    it('alwaysInitializeProvidedDatabase=true: calls initialize() exactly once on an injected database', async () => {
      const db = { initialize: jest.fn().mockResolvedValue(undefined) };
      const repo = new AzureTableRepository(db, { alwaysInitializeProvidedDatabase: true });
      await repo._ensureInitialized();
      await repo._ensureInitialized();
      expect(db.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('_run', () => {
    it('returns the resolved value on success', async () => {
      const repo = new AzureTableRepository({});
      const result = await repo._run(async () => 'value', 'err');
      expect(result).toBe('value');
    });

    it('logs and rethrows on any error', async () => {
      const repo = new AzureTableRepository({});
      const err = new Error('boom');
      await expect(repo._run(async () => { throw err; }, 'custom message')).rejects.toBe(err);
    });
  });

  describe('_withNotFound', () => {
    it('returns the resolved value on success', async () => {
      const repo = new AzureTableRepository({});
      const result = await repo._withNotFound(async () => 'found', null, 'err');
      expect(result).toBe('found');
    });

    it('returns notFoundValue on a 404 statusCode without rethrowing', async () => {
      const repo = new AzureTableRepository({});
      const err = Object.assign(new Error('missing'), { statusCode: 404 });
      const result = await repo._withNotFound(async () => { throw err; }, 'fallback', 'err');
      expect(result).toBe('fallback');
    });

    it('rethrows non-404 errors', async () => {
      const repo = new AzureTableRepository({});
      const err = Object.assign(new Error('server error'), { statusCode: 500 });
      await expect(repo._withNotFound(async () => { throw err; }, null, 'err')).rejects.toBe(err);
    });
  });

  describe('_collect', () => {
    async function* asyncGen(items) {
      for (const item of items) yield item;
    }

    it('maps every yielded entity into an array', async () => {
      const repo = new AzureTableRepository({});
      const result = await repo._collect(asyncGen([{ n: 1 }, { n: 2 }]), (e) => e.n * 10, 'err');
      expect(result).toEqual([10, 20]);
    });

    it('logs and rethrows if iteration throws', async () => {
      const repo = new AzureTableRepository({});
      async function* throwing() {
        yield { n: 1 };
        throw new Error('iteration failed');
      }
      await expect(repo._collect(throwing(), (e) => e.n, 'err')).rejects.toThrow('iteration failed');
    });
  });

  describe('_create', () => {
    it('creates the entity via the client on success', async () => {
      const repo = new AzureTableRepository({});
      const client = { createEntity: jest.fn().mockResolvedValue(undefined) };
      await repo._create(client, { rowKey: 'a' }, {
        conflictMessage: 'exists',
        conflictLogMessage: 'exists-log',
        errorLogMessage: 'error-log',
      });
      expect(client.createEntity).toHaveBeenCalledWith({ rowKey: 'a' });
    });

    it('throws InfrastructureError(conflictMessage) on a 409', async () => {
      const repo = new AzureTableRepository({});
      const client = {
        createEntity: jest.fn().mockRejectedValue(Object.assign(new Error('conflict'), { statusCode: 409 })),
      };
      await expect(repo._create(client, {}, {
        conflictMessage: 'Broker already exists: x',
        conflictLogMessage: 'log',
        errorLogMessage: 'log2',
      })).rejects.toThrow(InfrastructureError);
    });

    it('rethrows the original error on any other failure', async () => {
      const repo = new AzureTableRepository({});
      const err = Object.assign(new Error('server error'), { statusCode: 500 });
      const client = { createEntity: jest.fn().mockRejectedValue(err) };
      await expect(repo._create(client, {}, {
        conflictMessage: 'x', conflictLogMessage: 'y', errorLogMessage: 'z',
      })).rejects.toBe(err);
    });
  });

  describe('_resolveId', () => {
    class FakeValueObject {
      constructor(value) { this.value = value; }
    }

    it('resolves a matching value-object instance to its .value', () => {
      const repo = new AzureTableRepository({});
      const vo = new FakeValueObject('abc');
      expect(repo._resolveId(vo, FakeValueObject)).toBe('abc');
    });

    it('stringifies a plain value when no ValueObjectClass is given', () => {
      const repo = new AzureTableRepository({});
      expect(repo._resolveId('abc')).toBe('abc');
      expect(repo._resolveId(123)).toBe('123');
    });

    it('stringifies a value that is not an instance of ValueObjectClass', () => {
      const repo = new AzureTableRepository({});
      expect(repo._resolveId('abc', FakeValueObject)).toBe('abc');
    });
  });
});
