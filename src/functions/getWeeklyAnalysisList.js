/**
 * GET /api/analysis/weekly — list past weekly analyses, newest first.
 *
 * Feature 002. Read-only; matches contracts/api.md.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, mapError } = require('./_shared');

app.http('getWeeklyAnalysisList', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'analysis/weekly',
  handler: async (request, context) => {
    try {
      const limitParam = request.query.get('limit');
      const limit = limitParam ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 20)) : 20;

      const repo = container.getAnalysisRepository();
      const rows = await repo.getLatest(limit);

      const items = rows.map((a) => {
        const base = {
          date: a.date,
          status: a.status,
          modelUsed: a.modelUsed,
          generatedAt: a.generatedAt instanceof Date ? a.generatedAt.toISOString() : a.generatedAt,
        };
        if (a.isCompleted()) {
          return {
            ...base,
            summary: a.summary,
            riesgoPaisBp: a.riesgoPaisBp,
            riesgoPaisAsOf: a.riesgoPaisAsOf,
            orderCount: null, // filled in lazily — see note below
            costUsd: a.costUsd,
          };
        }
        return {
          ...base,
          errorMessage: a.errorMessage,
        };
      });

      // We deliberately do NOT batch-fetch orderCounts here — that'd be N+1.
      // The dashboard list can display "—" for orderCount until the user clicks
      // into a detail page (cheap full fetch). If a future iteration wants
      // orderCount on the list, add it to the analysis row at write time.

      return ok({ items });
    } catch (err) {
      return mapError(err, context);
    }
  },
});
