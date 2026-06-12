# Quickstart: Suggestion Scorecard

**Feature**: 007-suggestion-scorecard

Local dev recipe to exercise execution tracking, the freeze guard, proposals, and the scorecard.

## Prerequisites
- Functions on `http://localhost:7071/api`; Azurite running.
- At least one **completed** weekly analysis with suggested orders (run the analysis once — see
  feature 006 quickstart). Two analyses on different dates let you test the prior-status feed.

## Verify

1. **Detail shows orders with status + proposal**:
   ```bash
   curl "http://localhost:7071/api/analysis/weekly/<DATE>?code=<key>" | jq '.orders[0], .frozen'
   ```
   Each order has `executionStatus: "pending"`; pending orders show a `proposedStatus` derived from
   the week's `positionChanges` (absent if positionChanges is null). `frozen` is false initially.

2. **Set an execution status** (propose-only → owner confirms via PATCH):
   ```bash
   curl -X PATCH "http://localhost:7071/api/analysis/weekly/<DATE>/orders/0?code=<key>" \
     -H "Content-Type: application/json" -d '{"status":"executed","note":"filled"}'
   ```
   Re-fetch the detail: order 0 shows `executed` + note + `executionUpdatedAt`; `frozen` is now true.

3. **Freeze guard** (FR-004): with order 0 marked, re-trigger the analysis for `<DATE>` (admin
   Test/Run or the one-off run script). The run is **skipped** — the existing analysis, orders, and
   statuses are unchanged (no overwrite, no LLM cost). Check the function log for a "frozen, skipped"
   metadata line. (SC-003)

4. **Prior status feeds the next analysis** (FR-009): run the analysis for a later date. Confirm the
   AI user message's `## previousAnalysis` block lists the prior orders each with its
   `executionStatus`. (Inspect via a unit test or a temporary log of the user message length/structure
   — never log holdings.)

5. **Scorecard**:
   ```bash
   curl "http://localhost:7071/api/analysis/scorecard?code=<key>" | jq '.overall, .byConviction.high, .sufficientData'
   ```
   Shows executed/partial/skipped/pending counts + `executionRate` overall and by conviction;
   `sufficientData:false` when history is short.

6. **Dashboard**: open the analysis-detail page for `<DATE>` — each order has a status control + note
   + proposal hint + a "frozen" badge once marked; the new Scorecard page shows the rates by
   conviction with an "insufficient data" state early on.

## Tests
```bash
npm run test:unit   # OrderExecutionMatcher, entity validation, use-cases (freeze guard, set status, scorecard)
npm test            # full suite (CI parity)
```
Use clearly-fake holdings data in all fixtures (Constitution I).
