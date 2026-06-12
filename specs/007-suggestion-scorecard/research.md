# Phase 0 Research: Suggestion Scorecard

**Feature**: 007-suggestion-scorecard | **Date**: 2026-06-12

The five spec clarifications already resolve the open product decisions. This document records
the remaining design/architecture decisions (Decision / Rationale / Alternatives), grounded in
the existing code.

---

## A. Where execution status is stored — ON the order row (no new table)

- **Decision**: Add three columns to the existing `portfolioOrders` rows — `executionStatus`
  (pending|executed|partial|skipped), `executionNote`, `executionUpdatedAt`. The `SuggestedOrder`
  entity gains these as optional fields (default `pending`/null). Setting a status is a **Merge**
  upsert on the single order row (`partitionKey=analysisDate`, `rowKey=zero-padded index`).
- **Rationale**: The **permanent-freeze** clarification (FR-004) means a date whose orders carry
  any non-pending status is never re-run, so the order rows are stable — status can safely ride on
  the order row. The only destructive path (the wholesale order-replace in `upsert`) is gated by
  the freeze guard before any marking has happened (when there is nothing to lose). No new table →
  the constitution's fixed table list is unchanged; the detail endpoint already fetches orders, so
  status comes back for free.
- **Alternatives**: A separate `portfolioOrderStatus` table keyed by (date, index) — rejected: it
  buys re-attach-across-re-run robustness we explicitly don't need (freeze forbids the re-run), at
  the cost of a new table + join. Storing status on `SuggestedOrder` as a mutable field — rejected:
  the entity is immutable by design; the write is a row-level Merge, not an entity mutation.

## B. Freeze enforcement — guard in the generation use-case (skip, never overwrite)

- **Decision**: Add `IAnalysisRepository.hasMarkedOrders(date)` (true if any order for the date has
  a non-pending status). At the **start** of `GenerateWeeklyAnalysis.execute()` (right after the
  target date is resolved), if `hasMarkedOrders(targetDate)` is true, **return the existing analysis
  unchanged without running the LLM or calling `upsert`** (log a metadata-only "frozen, skipped").
- **Rationale**: Permanent freeze = the run must NOT overwrite a marked week. Returning early
  preserves the analysis row, its orders, and their statuses, and also saves the LLM cost. The
  normal weekly cadence is unaffected (each Friday is a new, unmarked date). This is the single
  enforcement point; no in-app force path exists (FR-004).
- **Alternatives**: Persist a `failed` row on freeze (the research agent's first idea) — **rejected**:
  it would overwrite the good analysis row with a failure, destroying exactly what we're protecting.
  Block at the repository `upsert` layer — viable but the use-case is the right altitude (it can skip
  the whole expensive run, not just the final write).

## C. Auto-proposal — pure matcher, computed at read time (propose-only)

- **Decision**: New pure domain service `OrderExecutionMatcher.propose(order, positionChanges)` →
  `executed | partial | skipped`. Matching by `symbol` + side direction (buy↔increase/add,
  sell↔reduce/remove): a same-direction change with magnitude ≥ the order quantity → `executed`;
  a smaller same-direction change (>0) → `partial`; no matching change → `skipped`. The detail
  endpoint annotates each **pending** order with a `proposedStatus`. Nothing is persisted (FR-006/7).
- **Rationale**: Both `orders` and `positionChanges` are already in the detail response (feature
  006), so the proposal is a cheap pure computation; a domain service keeps it testable and shared.
  Propose-only means the proposal is display-only until the owner confirms via the PATCH endpoint.
- **Matching detail**: greedy by order; same-symbol multiple orders consume position-change
  magnitude in order (accepted ambiguity for a single-user tool, per spec assumption). When
  `positionChanges` is `null` (unknown/first run), no proposal is offered (orders show `pending`).
- **Alternatives**: compute the proposal client-side in the dashboard — rejected: duplicates the
  matching rules in JS and isn't unit-testable. Persist proposals — rejected: violates propose-only.

## D. Feeding execution status to the next analysis

- **Decision**: `_loadPreviousAnalysis` already loads the prior orders; include each order's
  `executionStatus` in the mapped order objects, which already flow into the `## previousAnalysis`
  JSON block of the user message. Add a one-line instruction so the model uses it.
- **Rationale**: Minimal change; the prior orders are already fetched. Pre-feature prior orders have
  no status → treated as `pending` (FR-010).
- **Alternatives**: a separate prompt block — unnecessary; the orders already travel in
  `previousAnalysis`.

## E. Scorecard — new read-only use-case + endpoint

- **Decision**: New `GetSuggestionScorecard` use-case + `GET /api/analysis/scorecard` endpoint.
  Add `IAnalysisRepository.listAllOrders()` (scan `portfolioOrders`, tiny — ~tens/yr) and aggregate
  by `conviction` × `executionStatus`: counts and execution rate (executed / total) overall and per
  conviction level. **No outcome/P&L** (clarified). Graceful "insufficient data" when counts are low.
- **Rationale**: A single table scan over a tiny dataset is simplest; aggregation is pure. Read-only,
  no new storage.
- **Alternatives**: iterate `getLatest` + `getByDate` per date (N+1 calls) — works but `listAllOrders`
  is one scan and cleaner. Persist a rolled-up scorecard — rejected: trivially cheap to compute live.

## F. Write endpoint + dashboard

- **Decision**: `PATCH /api/analysis/weekly/{date}/orders/{index}` (auth `function`) → body
  `{ status, note? }` → `SetOrderExecutionStatus` use-case → `repo.setOrderExecutionStatus(...)`.
  Mirrors the existing `updatePosition` PUT pattern and the dashboard's inline-edit `api()` flow
  (positions page, commit `af2e8cc`). The detail page gains a per-order status control + note +
  proposal display + a "frozen" indicator; a new `scorecard.astro` page renders the scorecard.
- **Rationale**: Reuses established write-endpoint and dashboard-write conventions (function-key
  auth shipped to the browser is already how position edits work). No new patterns.
- **Alternatives**: a bulk "accept all proposals" endpoint — nice-to-have; can be done client-side by
  issuing per-order PATCHes, so a dedicated bulk route is optional (note in tasks).

## G. No new dependencies / tables

- **Decision**: Zero new npm packages, zero new Azure tables. Status columns ride on `portfolioOrders`.
- **Rationale**: Constitution requires justifying new deps/tables; none are needed.
