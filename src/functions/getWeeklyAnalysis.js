/**
 * GET /api/analysis/weekly/{date} — full detail for one weekly analysis.
 *
 * Feature 002. Read-only; matches contracts/api.md.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, fail, mapError } = require('./_shared');
const OrderExecutionMatcher = require('../domain/services/OrderExecutionMatcher');

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
        // Feature 006 (FR-019/FR-021): macro panel, portfolio totals, and the
        // week's position changes — present on completed AND failed rows when
        // captured; null on pre-feature rows. positionChanges: null = unknown,
        // [] = no changes. The internal per-position snapshot stays internal.
        macroContext: analysis.macroContext || null,
        portfolioTotals: analysis.portfolioTotals || null,
        positionChanges: analysis.positionChanges,
        // Feature 010: structured sections. Code-computed (drift/caps) may be
        // present on completed AND failed rows; LLM-emitted (watchlist/
        // weekOverWeek/frameworkAmendments) only on completed. Null on
        // pre-feature rows and when a section was not produced. Consumers omit
        // any section that is null/empty/malformed (FR-008).
        driftByBucket: analysis.driftByBucket,
        driftByAssetClass: analysis.driftByAssetClass,
        concentrationCaps: analysis.concentrationCaps,
        watchlist: analysis.watchlist,
        weekOverWeek: analysis.weekOverWeek,
        frameworkAmendments: analysis.frameworkAmendments,
      };

      if (analysis.isCompleted()) {
        body.summary = analysis.summary;
        body.markdownBody = analysis.markdownBody;
        body.riesgoPaisBp = analysis.riesgoPaisBp;
        body.riesgoPaisAsOf = analysis.riesgoPaisAsOf;
        // Feature 007: each order carries its execution status; pending orders
        // get a read-time proposal from the week's position changes (FR-006/8).
        const changes = analysis.positionChanges; // null|[]|[...] (feature 006)
        body.orders = orders.map((o) => {
          const out = {
            index: o.index,
            broker: o.broker,
            symbol: o.symbol,
            side: o.side,
            quantity: o.quantity,
            rationale: o.rationale,
            conviction: o.conviction,
            executionStatus: o.executionStatus || 'pending',
            executionNote: o.executionNote || null,
            executionUpdatedAt: o.executionUpdatedAt || null,
          };
          if (out.executionStatus === 'pending') {
            const proposed = OrderExecutionMatcher.propose(o, changes);
            if (proposed) out.proposedStatus = proposed;
          }
          return out;
        });
        // Feature 007: any non-pending order freezes the week (FR-004).
        body.frozen = body.orders.some((o) => o.executionStatus !== 'pending');
      } else {
        body.errorMessage = analysis.errorMessage;
        body.orders = [];
        body.frozen = false;
      }

      return ok(body);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
