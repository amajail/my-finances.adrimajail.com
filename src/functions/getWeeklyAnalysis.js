/**
 * GET /api/analysis/weekly/{date} — full detail for one weekly analysis.
 *
 * Feature 002. Read-only; matches contracts/api.md.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, fail, mapError } = require('./_shared');

app.http('getWeeklyAnalysis', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'analysis/weekly/{date}',
  handler: async (request, context) => {
    try {
      const date = request.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
        return fail(400, 'invalid date format; expected YYYY-MM-DD');
      }

      const repo = container.getAnalysisRepository();
      const result = await repo.getByDate(date);

      if (!result) {
        return fail(404, `no analysis exists for ${date}`);
      }

      const { analysis, orders } = result;

      const body = {
        date: analysis.date,
        status: analysis.status,
        generatedAt: analysis.generatedAt instanceof Date ? analysis.generatedAt.toISOString() : analysis.generatedAt,
        modelUsed: analysis.modelUsed,
        promptVersion: analysis.promptVersion,
        tokensIn: analysis.tokensIn,
        tokensOut: analysis.tokensOut,
        costUsd: analysis.costUsd,
        durationMs: analysis.durationMs,
        // Feature 005 (FR-013): link to the instructions version that produced
        // this analysis. Null for pre-005 analyses.
        instructionsHistoryRowKey: analysis.instructionsHistoryRowKey || null,
        // Feature 004 (legacy): framework reference for pre-005 analyses.
        frameworkHistoryRowKey: analysis.frameworkHistoryRowKey || null,
      };

      if (analysis.isCompleted()) {
        body.summary = analysis.summary;
        body.markdownBody = analysis.markdownBody;
        body.riesgoPaisBp = analysis.riesgoPaisBp;
        body.riesgoPaisAsOf = analysis.riesgoPaisAsOf;
        body.orders = orders.map((o) => ({
          index: o.index,
          broker: o.broker,
          symbol: o.symbol,
          side: o.side,
          quantity: o.quantity,
          rationale: o.rationale,
          conviction: o.conviction,
        }));
      } else {
        body.errorMessage = analysis.errorMessage;
        body.orders = [];
      }

      return ok(body);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
