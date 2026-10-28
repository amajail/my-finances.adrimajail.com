/**
 * GET /api/analysis/weekly/{date} — full detail for one weekly analysis.
 *
 * Feature 002. Read-only; matches contracts/api.md.
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');
const { ok, fail, mapError } = require('./_shared');
const OrderExecutionMatcher = require('../domain/services/OrderExecutionMatcher');
const { MAX_LOOKBACK_WEEKS } = require('../domain/services/PendingOrderTracker');

/**
 * Feature 020: Map<orderIndex, 'executed'|'partial'> for the pending orders of
 * `date`, using position changes from completed analyses dated after it.
 * Display-only; any storage problem just means no proposals.
 */
async function proposeFromLaterWeeks(repo, date, orders) {
  const pending = orders.filter((o) => (o.executionStatus || 'pending') === 'pending');
  const out = new Map();
  if (pending.length === 0 || typeof repo.getLatest !== 'function') return out;
  try {
    const recent = await repo.getLatest(MAX_LOOKBACK_WEEKS + 2);
    const later = (recent || [])
      .filter((a) => a.date > date && a.status === 'completed')
      .map((a) => ({ positionChanges: a.positionChanges }));
    const results = OrderExecutionMatcher.proposeAcrossWeeks(pending, later);
    pending.forEach((o, i) => { if (results[i]) out.set(o.index, results[i]); });
  } catch (_err) {
    // propose-only: failing to compute a proposal must never fail the read
  }
  return out;
}

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
        // Feature 012: deterministic macro week-over-week comparison (null on
        // pre-feature rows and first runs).
        macroChanges: analysis.macroChanges,
        // Feature 013: administrative / non-investable positions (computed value
        // <= 0; excluded from drift/caps). [] on pre-feature rows and when none.
        administrativePositions: analysis.administrativePositions,
        // Feature 014: cross-broker duplicate-holdings groups (null on pre-feature
        // rows and when there are no duplicates).
        duplications: analysis.duplications,
        // Feature 019: earmarked-broker reserve positions, excluded from
        // invested-capital reasoning (drift/caps/duplications/positionChanges).
        // [] on pre-feature rows and when none.
        earmarkedPositions: analysis.earmarkedPositions,
      };

      if (analysis.isCompleted()) {
        body.summary = analysis.summary;
        body.markdownBody = analysis.markdownBody;
        body.riesgoPaisBp = analysis.riesgoPaisBp;
        body.riesgoPaisAsOf = analysis.riesgoPaisAsOf;
        // Feature 007: each order carries its execution status. Feature 020: pending
        // orders get a display-only proposal from the position changes of every
        // completed week AFTER this analysis (a fill can only show up later;
        // changes in the order's own week predate it), never 'skipped'.
        const proposals = await proposeFromLaterWeeks(repo, analysis.date, orders);
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
            // Feature 020: prior consecutive weeks pending when issued (0 = new).
            ageWeeks: o.ageWeeks || 0,
          };
          const proposed = proposals.get(o.index);
          if (out.executionStatus === 'pending' && proposed) out.proposedStatus = proposed;
          return out;
        });
        // Feature 020: orders awaiting owner confirmation ([] on pre-feature rows).
        body.confirmationItems = analysis.confirmationItems || [];
        // Feature 007: any non-pending order freezes the week (FR-004).
        body.frozen = body.orders.some((o) => o.executionStatus !== 'pending');
      } else {
        body.errorMessage = analysis.errorMessage;
        body.orders = [];
        body.confirmationItems = analysis.confirmationItems || [];
        body.frozen = false;
      }

      return ok(body);
    } catch (err) {
      return mapError(err, context);
    }
  },
});
