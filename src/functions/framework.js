/**
 * Framework HTTP endpoints (feature 004-editable-strategic-framework).
 *
 *   GET    /api/framework
 *   PUT    /api/framework
 *   GET    /api/framework/history
 *   GET    /api/framework/history/{rowKey}
 *   POST   /api/framework/history/{rowKey}/restore
 *
 * Writes (PUT, POST) and reads alike use `authLevel: 'function'`, matching
 * the operator-only gating already in place for `settings`, `prices/refresh`,
 * etc. (FR-010).
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

/**
 * GET /api/framework — return the active framework.
 */
app.http('getFramework', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'framework',
  handler: async (request, context) => {
    try {
      const useCase = container.getGetActiveFramework();
      const result = await useCase.execute();
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * PUT /api/framework — save a new active framework.
 * Body: { content: string, changeNote?: string }
 */
app.http('updateFramework', {
  methods: ['PUT'],
  authLevel: 'function',
  route: 'framework',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const useCase = container.getSaveFramework();
      const result = await useCase.execute({
        content: body?.content,
        changeNote: body?.changeNote ?? null,
      });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * GET /api/framework/history — list newest-first.
 * Query: ?limit=N (1..200, default 50)
 */
app.http('listFrameworkHistory', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'framework/history',
  handler: async (request, context) => {
    try {
      const rawLimit = request.query.get('limit');
      const limit = rawLimit !== null && rawLimit !== '' ? Number(rawLimit) : undefined;
      const useCase = container.getListFrameworkHistory();
      const result = await useCase.execute({ limit });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * GET /api/framework/history/{rowKey} — full content of one entry.
 */
app.http('getFrameworkHistoryEntry', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'framework/history/{rowKey}',
  handler: async (request, context) => {
    try {
      const rowKey = request.params.rowKey;
      const useCase = container.getGetFrameworkHistoryEntry();
      const result = await useCase.execute({ rowKey });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * POST /api/framework/history/{rowKey}/restore — promote a past entry to active.
 * Body (optional): { changeNote?: string }
 */
app.http('restoreFrameworkVersion', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'framework/history/{rowKey}/restore',
  handler: async (request, context) => {
    try {
      const rowKey = request.params.rowKey;
      const body = await request.json().catch(() => ({}));
      const useCase = container.getRestoreFrameworkVersion();
      const result = await useCase.execute({
        rowKey,
        changeNote: body?.changeNote ?? null,
      });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
