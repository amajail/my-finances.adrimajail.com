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
 *
 * The list/detail/restore routes are registered but their use-cases will be
 * wired in later phases (US2/US3). Each handler throws NotFoundError until
 * its use-case lands, which mapError turns into a 404 — leaving the routes
 * safe to register up-front without 500s.
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
