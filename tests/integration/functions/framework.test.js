/**
 * HTTP smoke tests for the framework endpoints (feature 004).
 *
 * Mocks the DI container so the tests run without Azurite. Asserts status
 * codes + response shapes against contracts/api.md.
 *
 * "Integration" label is for the test location; the SDK boundary is mocked.
 */

// Capture handlers that the function file registers via app.http(...).
const httpHandlers = {};
jest.mock('@azure/functions', () => ({
  app: {
    http: (name, config) => { httpHandlers[name] = config; },
    timer: () => {},
  },
}));

const container = require('../../../src/application/di/container');
const FrameworkHistoryEntry = require('../../../src/domain/entities/FrameworkHistoryEntry');

require('../../../src/functions/framework');

function makeContext() {
  return {
    log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  };
}

function makeRequest({ params = {}, body = undefined, query = {} } = {}) {
  return {
    params,
    query: { get: (k) => query[k] ?? null },
    json: async () => body,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/framework', () => {
  it('returns the active framework with maxBytes', async () => {
    jest.spyOn(container, 'getGetActiveFramework').mockReturnValue({
      execute: jest.fn(async () => ({
        content: '## Buckets\n- US: example\n',
        historyRowKey: '8284032399876-a3f9',
        updatedAt: '2026-05-17T14:02:03.456Z',
        maxBytes: FrameworkHistoryEntry.MAX_BYTES,
      })),
    });

    const res = await httpHandlers.getFramework.handler(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({
      content: '## Buckets\n- US: example\n',
      historyRowKey: '8284032399876-a3f9',
      updatedAt: '2026-05-17T14:02:03.456Z',
      maxBytes: FrameworkHistoryEntry.MAX_BYTES,
    });
  });

  it('surfaces null historyRowKey/updatedAt for pre-feature seeded content (FR-013)', async () => {
    jest.spyOn(container, 'getGetActiveFramework').mockReturnValue({
      execute: jest.fn(async () => ({
        content: 'seeded content',
        historyRowKey: null,
        updatedAt: null,
        maxBytes: FrameworkHistoryEntry.MAX_BYTES,
      })),
    });

    const res = await httpHandlers.getFramework.handler(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(res.jsonBody.historyRowKey).toBeNull();
    expect(res.jsonBody.updatedAt).toBeNull();
  });

  it('returns 404 when no framework is configured', async () => {
    const { NotFoundError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getGetActiveFramework').mockReturnValue({
      execute: jest.fn(async () => { throw new NotFoundError('strategic framework', 'analysis.strategicFrameworkV1'); }),
    });

    const res = await httpHandlers.getFramework.handler(makeRequest(), makeContext());

    expect(res.status).toBe(404);
    expect(res.jsonBody.error).toMatch(/strategic framework not found/);
  });
});

describe('PUT /api/framework', () => {
  it('returns 200 + noop=false when a new save lands', async () => {
    jest.spyOn(container, 'getSaveFramework').mockReturnValue({
      execute: jest.fn(async () => ({
        historyRowKey: '8284032399876-a3f9',
        timestamp: '2026-05-17T14:02:03.456Z',
        noop: false,
      })),
    });

    const res = await httpHandlers.updateFramework.handler(
      makeRequest({ body: { content: 'new content', changeNote: 'bumped' } }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({
      historyRowKey: '8284032399876-a3f9',
      timestamp: '2026-05-17T14:02:03.456Z',
      noop: false,
    });
  });

  it('returns 200 + noop=true when content matches active (FR-011)', async () => {
    jest.spyOn(container, 'getSaveFramework').mockReturnValue({
      execute: jest.fn(async () => ({
        historyRowKey: '8284032399000-bb12',
        timestamp: '2026-05-17T13:45:11.222Z',
        noop: true,
      })),
    });

    const res = await httpHandlers.updateFramework.handler(
      makeRequest({ body: { content: 'same as active' } }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.noop).toBe(true);
  });

  it('returns 400 when content is empty (FR-004)', async () => {
    const { ValidationError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getSaveFramework').mockReturnValue({
      execute: jest.fn(async () => { throw new ValidationError('content is required'); }),
    });

    const res = await httpHandlers.updateFramework.handler(
      makeRequest({ body: { content: '' } }),
      makeContext()
    );

    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toMatch(/content is required/);
  });

  it('returns 400 when content exceeds the 60 KB cap (FR-017)', async () => {
    const { ValidationError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getSaveFramework').mockReturnValue({
      execute: jest.fn(async () => {
        throw new ValidationError('content exceeds maximum size of 61440 bytes (got 70000)');
      }),
    });

    const res = await httpHandlers.updateFramework.handler(
      makeRequest({ body: { content: 'x'.repeat(70000) } }),
      makeContext()
    );

    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toMatch(/exceeds maximum size of 61440 bytes/);
  });

  it('passes content + changeNote through to the use-case', async () => {
    const exec = jest.fn(async () => ({
      historyRowKey: 'x', timestamp: 't', noop: false,
    }));
    jest.spyOn(container, 'getSaveFramework').mockReturnValue({ execute: exec });

    await httpHandlers.updateFramework.handler(
      makeRequest({ body: { content: 'c', changeNote: 'n' } }),
      makeContext()
    );

    expect(exec).toHaveBeenCalledWith({ content: 'c', changeNote: 'n' });
  });

  it('treats missing JSON body as empty (lets the use-case reject)', async () => {
    const { ValidationError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getSaveFramework').mockReturnValue({
      execute: jest.fn(async () => { throw new ValidationError('content is required'); }),
    });

    const req = {
      params: {},
      query: { get: () => null },
      json: async () => { throw new Error('not json'); },
    };
    const res = await httpHandlers.updateFramework.handler(req, makeContext());

    expect(res.status).toBe(400);
  });
});

describe('GET /api/framework/history', () => {
  it('returns the list shape', async () => {
    jest.spyOn(container, 'getListFrameworkHistory').mockReturnValue({
      execute: jest.fn(async () => ({
        entries: [
          { rowKey: 'r1', timestamp: '2026-05-17T14:00Z', changeNote: 'edit', source: 'edit', restoreOfRowKey: null, contentBytes: 100 },
        ],
        count: 1,
      })),
    });

    const res = await httpHandlers.listFrameworkHistory.handler(
      makeRequest({ query: {} }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.count).toBe(1);
    expect(res.jsonBody.entries[0]).toEqual(expect.objectContaining({
      rowKey: 'r1', contentBytes: 100, source: 'edit',
    }));
  });

  it('forwards the limit query param to the use-case', async () => {
    const exec = jest.fn(async () => ({ entries: [], count: 0 }));
    jest.spyOn(container, 'getListFrameworkHistory').mockReturnValue({ execute: exec });

    await httpHandlers.listFrameworkHistory.handler(
      makeRequest({ query: { limit: '25' } }),
      makeContext()
    );

    expect(exec).toHaveBeenCalledWith({ limit: 25 });
  });

  it('returns 400 when limit is out of range', async () => {
    const { ValidationError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getListFrameworkHistory').mockReturnValue({
      execute: jest.fn(async () => { throw new ValidationError('limit must be between 1 and 200'); }),
    });

    const res = await httpHandlers.listFrameworkHistory.handler(
      makeRequest({ query: { limit: '500' } }),
      makeContext()
    );

    expect(res.status).toBe(400);
  });

  it('returns 200 + empty list when no entries exist (FR-013)', async () => {
    jest.spyOn(container, 'getListFrameworkHistory').mockReturnValue({
      execute: jest.fn(async () => ({ entries: [], count: 0 })),
    });

    const res = await httpHandlers.listFrameworkHistory.handler(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ entries: [], count: 0 });
  });
});

describe('GET /api/framework/history/{rowKey}', () => {
  it('returns the full entry shape', async () => {
    jest.spyOn(container, 'getGetFrameworkHistoryEntry').mockReturnValue({
      execute: jest.fn(async ({ rowKey }) => ({
        rowKey,
        timestamp: '2026-05-17T14:00Z',
        changeNote: 'note',
        source: 'edit',
        restoreOfRowKey: null,
        content: '## body',
      })),
    });

    const res = await httpHandlers.getFrameworkHistoryEntry.handler(
      makeRequest({ params: { rowKey: 'r-abc' } }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.content).toBe('## body');
    expect(res.jsonBody.rowKey).toBe('r-abc');
  });

  it('returns 404 when the entry does not exist', async () => {
    const { NotFoundError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getGetFrameworkHistoryEntry').mockReturnValue({
      execute: jest.fn(async () => { throw new NotFoundError('history entry', 'r-missing'); }),
    });

    const res = await httpHandlers.getFrameworkHistoryEntry.handler(
      makeRequest({ params: { rowKey: 'r-missing' } }),
      makeContext()
    );

    expect(res.status).toBe(404);
    expect(res.jsonBody.error).toMatch(/history entry not found/);
  });
});

describe('POST /api/framework/history/{rowKey}/restore', () => {
  it('returns 200 with the new history row reference', async () => {
    jest.spyOn(container, 'getRestoreFrameworkVersion').mockReturnValue({
      execute: jest.fn(async ({ rowKey }) => ({
        historyRowKey: 'new-row',
        timestamp: '2026-05-17T14:30:00Z',
        restoreOfRowKey: rowKey,
        noop: false,
      })),
    });

    const res = await httpHandlers.restoreFrameworkVersion.handler(
      makeRequest({ params: { rowKey: 'r-target' }, body: { changeNote: 'rolling back' } }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({
      historyRowKey: 'new-row',
      timestamp: '2026-05-17T14:30:00Z',
      restoreOfRowKey: 'r-target',
      noop: false,
    });
  });

  it('returns 200 with noop:true when the target equals active', async () => {
    jest.spyOn(container, 'getRestoreFrameworkVersion').mockReturnValue({
      execute: jest.fn(async ({ rowKey }) => ({
        historyRowKey: 'curr-x',
        timestamp: 'curr-t',
        restoreOfRowKey: rowKey,
        noop: true,
      })),
    });

    const res = await httpHandlers.restoreFrameworkVersion.handler(
      makeRequest({ params: { rowKey: 'r-same' }, body: {} }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.noop).toBe(true);
  });

  it('returns 404 for an unknown rowKey', async () => {
    const { NotFoundError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getRestoreFrameworkVersion').mockReturnValue({
      execute: jest.fn(async () => { throw new NotFoundError('history entry', 'r-missing'); }),
    });

    const res = await httpHandlers.restoreFrameworkVersion.handler(
      makeRequest({ params: { rowKey: 'r-missing' }, body: {} }),
      makeContext()
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 when changeNote exceeds 280 chars', async () => {
    const { ValidationError } = require('../../../src/shared/errors');
    jest.spyOn(container, 'getRestoreFrameworkVersion').mockReturnValue({
      execute: jest.fn(async () => { throw new ValidationError('changeNote exceeds 280 characters'); }),
    });

    const res = await httpHandlers.restoreFrameworkVersion.handler(
      makeRequest({ params: { rowKey: 'r-x' }, body: { changeNote: 'y'.repeat(281) } }),
      makeContext()
    );

    expect(res.status).toBe(400);
  });
});
