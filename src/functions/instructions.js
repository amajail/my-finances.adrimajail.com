/**
 * Instructions HTTP endpoints (feature 005-editable-metaprompt).
 *
 *   GET    /api/instructions
 *   PUT    /api/instructions
 *   GET    /api/instructions/history
 *   GET    /api/instructions/history/{rowKey}
 *   POST   /api/instructions/history/{rowKey}/restore
 *
 * Writes (PUT, POST) and reads alike use `authLevel: 'function'`, matching
 * the operator-only gating already in place for `settings`, `prices/refresh`,
 * etc. (FR-016).
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

/**
 * GET /api/instructions — return the active instructions document.
 */
app.http('getInstructions', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'instructions',
  handler: async (request, context) => {
    try {
      const useCase = container.getGetActiveInstructions();
      const result = await useCase.execute();
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * PUT /api/instructions — save a new active instructions document.
 * Body: { content: string, changeNote?: string }
 */
app.http('updateInstructions', {
  methods: ['PUT'],
  authLevel: 'function',
  route: 'instructions',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const useCase = container.getSaveInstructions();
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
 * GET /api/instructions/history — list newest-first.
 * Query: ?limit=N (1..200, default 50)
 */
app.http('listInstructionsHistory', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'instructions/history',
  handler: async (request, context) => {
    try {
      const rawLimit = request.query.get('limit');
      const limit = rawLimit !== null && rawLimit !== '' ? Number(rawLimit) : undefined;
      const useCase = container.getListInstructionsHistory();
      const result = await useCase.execute({ limit });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * GET /api/instructions/history/{rowKey} — full content of one entry.
 */
app.http('getInstructionsHistoryEntry', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'instructions/history/{rowKey}',
  handler: async (request, context) => {
    try {
      const rowKey = request.params.rowKey;
      const useCase = container.getGetInstructionsHistoryEntry();
      const result = await useCase.execute({ rowKey });
      return ok(result);
    } catch (err) {
      return mapError(err, context);
    }
  },
});

/**
 * POST /api/instructions/history/{rowKey}/restore — promote a past entry to active.
 * Body (optional): { changeNote?: string }
 */
app.http('restoreInstructionsVersion', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'instructions/history/{rowKey}/restore',
  handler: async (request, context) => {
    try {
      const rowKey = request.params.rowKey;
      const body = await request.json().catch(() => ({}));
      const useCase = container.getRestoreInstructionsVersion();
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
