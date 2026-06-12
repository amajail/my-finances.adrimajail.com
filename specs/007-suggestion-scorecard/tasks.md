---
description: "Task list for Suggestion Scorecard"
---

# Tasks: Suggestion Scorecard (Execution Tracking)

**Input**: Design documents from `/specs/007-suggestion-scorecard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: Included — Constitution IV (Pragmatic Testing) requires tests for domain entities,
services, use-cases, and repository round-trips. All fixtures MUST use clearly-fake holdings.

**Organization**: Tasks grouped by user story. Note: a few files are touched by multiple stories
(`AzureAnalysisRepository.js`, `GenerateWeeklyAnalysis.js`, `getWeeklyAnalysis.js`,
`analysis-detail.astro`); those edits are serialized (not `[P]` across stories). The entity +
repository round-trip scaffolding (Phase 2) makes the status fields available to every story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish have no story label)

## Path Conventions

Backend: `src/` at repo root. Dashboard: `dashboard/src/`. Tests: `tests/unit/`, `tests/integration/`.

---

## Phase 1: Setup

**Purpose**: Light prep only — no new deps, no new tables.

- [ ] T001 [P] Add a "Scorecard" navigation entry pointing to `/scorecard` in the dashboard shared layout `dashboard/src/layouts/Layout.astro` (the page itself is built in US4; the link is harmless until then)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Give every order an execution status field and make it round-trip through storage.

**⚠️ CRITICAL**: Blocks all user stories.

- [ ] T002 [P] Extend `SuggestedOrder` in `src/domain/entities/SuggestedOrder.js`: add an `EXECUTION_STATUSES` enum (`pending`|`executed`|`partial`|`skipped`) and optional fields `executionStatus` (default `pending`), `executionNote` (default null, soft length cap), `executionUpdatedAt` (default null); extend validation, `toJSON`, `fromJSON`. Entity stays immutable.
- [ ] T003 [P] Unit tests in `tests/unit/domain/entities/SuggestedOrder.test.js`: default `pending` when absent, invalid status rejected, note length cap, round-trip via `toJSON`/`fromJSON`.
- [ ] T004 Extend `AzureAnalysisRepository` `_orderToEntity`/`_orderFromEntity` in `src/infrastructure/repositories/AzureAnalysisRepository.js`: write/read `executionStatus`, `executionNote`, `executionUpdatedAt` columns; missing columns → `pending`/null (pre-feature rows) (depends on T002).
- [ ] T005 [P] Integration test in `tests/integration/AzureAnalysisRepository.test.js`: order status survives upsert→getByDate round-trip; a pre-feature order row (no columns) reads back as `pending`.

**Checkpoint**: Orders carry an execution status end to end.

---

## Phase 3: User Story 1 - Record what was done + freeze the week (Priority: P1) 🎯 MVP

**Goal**: Owner sets executed/partial/skipped (+ note) per order; it persists; marking any order permanently freezes that week's re-runs.

**Independent Test**: Set an order's status via the API/UI, reload → it persisted; re-trigger that date's analysis → the run is skipped and statuses are intact.

- [ ] T006 [US1] Add `setOrderExecutionStatus(date, index, { status, note })` and `hasMarkedOrders(date)` to `src/application/interfaces/IAnalysisRepository.js`.
- [ ] T007 [US1] Implement `setOrderExecutionStatus` in `src/infrastructure/repositories/AzureAnalysisRepository.js`: Merge-upsert the three status columns on the one order row (`partitionKey=date`, `rowKey=zero-padded index`), stamp `executionUpdatedAt`; throw if the order row does not exist (depends on T004).
- [ ] T008 [US1] Implement `hasMarkedOrders(date)` in `src/infrastructure/repositories/AzureAnalysisRepository.js`: true if any order for the date has `executionStatus !== 'pending'` (same file, after T007).
- [ ] T009 [P] [US1] Integration test in `tests/integration/AzureAnalysisRepository.test.js`: `setOrderExecutionStatus` persists status+note+timestamp; `hasMarkedOrders` flips true after a non-pending mark and false when all pending.
- [ ] T010 [US1] `SetOrderExecutionStatus` use-case in `src/application/use-cases/analysis/SetOrderExecutionStatus.js`: validate status ∈ enum and note length, call `repo.setOrderExecutionStatus`, return the saved status object.
- [ ] T011 [P] [US1] Unit test `tests/unit/application/use-cases/analysis/SetOrderExecutionStatus.test.js`: invalid status rejected; repo called with parsed args; setting `pending` clears a prior mark.
- [ ] T012 [US1] Wire `SetOrderExecutionStatus` into `src/application/di/container.js` (`getSetOrderExecutionStatus()`).
- [ ] T013 [US1] PATCH function `src/functions/setOrderExecutionStatus.js`: route `analysis/weekly/{date}/orders/{index}`, auth `function`, parse body `{status, note}`, call the use-case, respond per contracts/api.md (400 invalid, 404 missing).
- [ ] T014 [US1] `src/functions/getWeeklyAnalysis.js`: include `executionStatus`/`executionNote`/`executionUpdatedAt` per order and a top-level `frozen` flag (true when any order is non-pending) in the detail response.
- [ ] T015 [US1] Freeze guard in `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`: at the start of `execute()` (after resolving `targetDate`), if `analysisRepository.hasMarkedOrders(targetDate)` is true, return the existing analysis (`getByDate`) WITHOUT calling the LLM or `upsert`; emit a metadata-only "frozen, skipped" log.
- [ ] T016 [P] [US1] Unit test in `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js`: a marked target date → LLM not called, `upsert` not called, existing analysis returned (SC-003).
- [ ] T017 [US1] `dashboard/src/pages/analysis-detail.astro`: per-order status control (executed/partial/skipped) + note input + Save (PATCH via `api()`), reflect the saved status, and a "frozen" badge once any order is marked.

**Checkpoint**: US1 fully functional — the MVP (a durable, freeze-protected execution log).

---

## Phase 4: User Story 2 - The next analysis knows what was executed (Priority: P2)

**Goal**: Prior-week orders reach the model annotated with their execution status.

**Independent Test**: With a prior analysis whose orders have statuses, run a new analysis → the AI inputs carry each prior order's status.

- [ ] T018 [US2] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, extend `_loadPreviousAnalysis` to include each prior order's `executionStatus` in the mapped order objects (they already flow into the `## previousAnalysis` block); add a one-line instruction that the model should use it (serializes after T015 — same file).
- [ ] T019 [P] [US2] Unit test in `GenerateWeeklyAnalysis.test.js`: prior orders supplied with `executionStatus`; a pre-feature prior (no statuses) is tolerated as `pending`.

**Checkpoint**: The loop is closed — the model reasons over real execution facts.

---

## Phase 5: User Story 3 - Auto-propose status from position changes (Priority: P2)

**Goal**: Each pending order shows a proposed status derived from feature 006's `positionChanges`; nothing saves until the owner confirms.

**Independent Test**: With known position changes, the detail view proposes sensible statuses; accepting them saves matching values.

- [ ] T020 [P] [US3] `OrderExecutionMatcher` pure service in `src/domain/services/OrderExecutionMatcher.js`: `propose(order, positionChanges)` → `executed|partial|skipped`; direction match (buy↔added/increased, sell↔removed/reduced); `|delta| ≥ qty`→executed, `0<|delta|<qty`→partial, none→skipped; greedy on same-symbol collisions; returns no proposal when `positionChanges` is null.
- [ ] T021 [P] [US3] Unit test `tests/unit/domain/services/OrderExecutionMatcher.test.js`: full→executed, partial→partial, no-match→skipped, sell↔reduce, null positionChanges→no proposal, same-symbol greedy.
- [ ] T022 [US3] `src/functions/getWeeklyAnalysis.js`: annotate each PENDING order with `proposedStatus` via `OrderExecutionMatcher` using the analysis's `positionChanges` (omit when null) (serializes after T014 — same file).
- [ ] T023 [US3] `dashboard/src/pages/analysis-detail.astro`: display each pending order's `proposedStatus` and an "accept" action (per-order and a bulk "accept all proposals") that PATCHes the confirmed values; nothing persists until the owner confirms (serializes after T017 — same file).

**Checkpoint**: Most weeks the owner just confirms proposals.

---

## Phase 6: User Story 4 - Scorecard (Priority: P3)

**Goal**: Execution rate + executed/partial/skipped mix by conviction across all analyses.

**Independent Test**: With several analyses' statuses, the scorecard aggregates correctly by conviction and degrades gracefully when history is short.

- [ ] T024 [US4] Add `listAllOrders()` to `src/application/interfaces/IAnalysisRepository.js` and implement it in `src/infrastructure/repositories/AzureAnalysisRepository.js` (scan `portfolioOrders`, return all `SuggestedOrder`s) (serializes after T008 — same repo file).
- [ ] T025 [US4] `GetSuggestionScorecard` use-case in `src/application/use-cases/analysis/GetSuggestionScorecard.js`: aggregate by `conviction` × `executionStatus`; compute `executionRate = executed/(executed+partial+skipped)`; `sufficientData = analysesCount >= 3` (FR-013); per data-model.md shape.
- [ ] T026 [P] [US4] Unit test `tests/unit/application/use-cases/analysis/GetSuggestionScorecard.test.js`: counts + rate (excludes pending) overall and by conviction; `sufficientData:false` when fewer than 3 analyses, true at ≥3; empty → no crash.
- [ ] T027 [US4] Wire `GetSuggestionScorecard` into `src/application/di/container.js` (`getGetSuggestionScorecard()`).
- [ ] T028 [US4] `src/functions/getSuggestionScorecard.js`: `GET /api/analysis/scorecard`, auth `function`, call the use-case, respond per contracts/api.md.
- [ ] T029 [US4] `dashboard/src/pages/scorecard.astro`: fetch `/analysis/scorecard`, render overall + by-conviction execution rates and the executed/partial/skipped mix, with a clear "insufficient data" state.

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Privacy scan of the whole diff: no real holdings/secrets; all new fixtures use placeholder symbols/quantities (Constitution I).
- [ ] T031 [P] Realign any existing analysis tests/fixtures affected by the order-shape change (e.g. `GenerateWeeklyAnalysis.test.js` order mocks now carry `executionStatus`).
- [ ] T032 Run `quickstart.md` end-to-end locally and verify SC-001…SC-006 (mark persists; freeze skips re-run; prior status fed; proposals; scorecard by conviction).

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** / **US3 (P5)** → **US4 (P6)** → **Polish (P7)**
- Foundational BLOCKS all stories (entity + repository round-trip).

### Story dependencies
- **US1 (P1)**: after Foundational. Delivers mark + persist + freeze. **MVP.**
- **US2 (P2)**: after US1 (freeze guard edit lands first in `GenerateWeeklyAnalysis.js`; T018 serializes after T015).
- **US3 (P2)**: after US1 for the shared files (`getWeeklyAnalysis.js` T022 after T014; `analysis-detail.astro` T023 after T017). The matcher (T020/T021) is fully parallel.
- **US4 (P3)**: after US1 for the repo file (T024 after T008); otherwise independent.

### Shared-file serialization (not `[P]` across stories)
- `src/infrastructure/repositories/AzureAnalysisRepository.js`: T004 → T007 → T008 → T024
- `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`: T015 → T018
- `src/functions/getWeeklyAnalysis.js`: T014 → T022
- `dashboard/src/pages/analysis-detail.astro`: T017 → T023
- `src/application/di/container.js`: T012, T027 (different methods; sequential)
- `src/application/interfaces/IAnalysisRepository.js`: T006, T024 (sequential)

### Parallel opportunities
- **Foundational**: T002 (entity) + T003 (entity test) authoring; T005 (repo test) parallel to entity work; T004 after T002.
- **US1**: T009/T011/T016 tests are `[P]`; repo methods T007→T008 sequential; T010 (use-case) parallel to T013/T014 authoring once the repo method exists.
- **US3**: T020 + T021 (matcher + test) fully parallel to everything.
- **US4**: T026 `[P]`.
- **Polish**: T030, T031 parallel.

---

## Parallel Example: User Story 3 matcher

```bash
# The matcher + its test are independent of the shared-file edits:
Task: "T020 OrderExecutionMatcher.propose(order, positionChanges)"
Task: "T021 OrderExecutionMatcher unit test"
# Then T022 (annotate detail) after T014; T023 (dashboard) after T017.
```

---

## Implementation Strategy

### MVP First (User Story 1)
1. Setup (T001) → Foundational (T002–T005).
2. US1 (T006–T017): mark + persist + freeze, end to end.
3. **STOP & VALIDATE**: status persists; re-trigger a marked date → run skipped (SC-003). Deploy/demo.

### Incremental delivery
- + US2 (prior status feeds the model) → validate → demo.
- + US3 (auto-proposals) → validate → demo.
- + US4 (scorecard) → validate → demo.
- Polish (T030–T032).

### Notes
- `[P]` = different files, no incomplete-task dependency.
- Respect the shared-file ordering above to avoid conflicts.
- All fixtures use fake holdings; scan every diff for Privacy First before staging.
- Commit after each task or logical group; conventional messages (`feat:`, `test:`, `refactor:`).
