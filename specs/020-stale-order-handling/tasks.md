---

description: "Task list for stale and unrecorded order handling (020)"
---

# Tasks: Stale and Unrecorded Order Handling

**Input**: Design documents from `/specs/020-stale-order-handling/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/weekly-analysis-api.md, quickstart.md

**Tests**: Included. The constitution (IV) requires tests for domain services and use-case orchestration, and the spec's success criteria (SC-001 to SC-003) are only verifiable by replay tests. All test data uses placeholders (`SYMBOL`, `BROKER`); never real holdings (FR-012).

**Organization**: grouped by user story. US1 and US2 are both P1 and share the tracker, so the tracker lives in Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3 per spec.md

## Phase 1: Setup

- [X] T001 Confirm the baseline is green before changing anything: run `npm test` and note the result in the PR description (no file change)

---

## Phase 2: Foundational (blocks all user stories)

**Purpose**: the domain pieces every story uses.

- [X] T002 [P] Add optional `ageWeeks` to `src/domain/entities/SuggestedOrder.js`: constructor reads `data.ageWeeks`, default `0`; validation `must be an integer between 0 and 8 inclusive`; expose a getter and include it in `toJSON`/serialisation alongside the other fields.
- [X] T003 [P] Add optional `confirmationItems` to `src/domain/entities/WeeklyAnalysis.js`: array or `[]`, frozen like `_positionChanges`; each item `{ broker, symbol, side, quantity, ageWeeks, originDate, lastDate, lastIndex, reason, proposedStatus }` (`lastDate` ISO date and `lastIndex` non-negative integer identify the order row to resolve) with `reason` one of `stale | likely-filled` and `proposedStatus` one of `executed | partial | null`; getter plus inclusion in `toJSON`.
- [X] T004 Create `src/domain/services/PendingOrderTracker.js` and export it from `src/domain/services/index.js`. Export constants `MAX_CONSECUTIVE_ISSUES = 3` and `MAX_LOOKBACK_WEEKS = 8`. Implement `build({ targetDate, analyses })` where `analyses` is `[{ date, status, positionChanges, orders[], confirmationItems[] }]`: keep only `status === 'completed'` and `date < targetDate`, newest first, at most 8; per key `broker|symbol|side`, walk back counting consecutive weeks that contain a `pending` order with that key; a `confirmationItem` on a prior analysis counts as a pending instance of its key (age +1, carrying its `lastDate`/`lastIndex`), so an escalated order stays in its chain until the owner resolves it (FR-014); stop at the first week without one or whose matching order is non-pending; return chains `{ key, broker, symbol, side, originDate, lastDate, lastIndex, ageWeeks (1..8, capped), lastQuantity, proposedStatus, reason }` with `reason` = `likely-filled` when `proposedStatus` is set, else `stale` when `ageWeeks >= MAX_CONSECUTIVE_ISSUES`, else `fresh`. Pure, no I/O.
- [X] T005 [P] Extend `src/domain/services/OrderExecutionMatcher.js` with `proposeAcrossWeeks(orders, weeksAfterIssue)`: sum same-direction deltas per `broker|symbol` from each later completed week's `positionChanges`, ignore weeks whose changes are `null`/unknown, consume deltas greedily oldest order first via a shared remaining-delta ledger so a change satisfies at most one order, return `executed` when the consumed magnitude covers the quantity, `partial` when some, otherwise `null`; never return `skipped`. Keep existing `propose` unchanged.
- [X] T006 [P] Unit tests for the tracker in `tests/unit/domain/services/PendingOrderTracker.test.js`: 3 consecutive pending weeks gives `ageWeeks = 3` and `stale`; 2 is `fresh`; a prior-analysis confirmation item continues the chain (weeks 4, 5 keep it stale, `lastDate`/`lastIndex` preserved) and stops once the pointed row is marked `skipped`; a missing week, an opposite side, or a non-pending status ends the chain; a failed analysis is skipped and not counted; 9 weeks caps at 8; empty input returns `[]`; placeholder data only.
- [X] T007 [P] Unit tests for the matcher extension in `tests/unit/domain/services/OrderExecutionMatcher.test.js` (append): later full increase proposes `executed`; smaller increase `partial`; none returns `null` and never `skipped`; unknown (`null`) weeks ignored; two orders for one key share one change without double count; opposite-direction change never matches.

**Checkpoint**: tracker and matcher tested; entities accept the new fields.

---

## Phase 3: User Story 1 - The analysis knows what it already suggested (Priority: P1) MVP

**Goal**: the model input lists pending orders with age and status; repeats are labelled as carry-overs with their age.

**Independent Test**: seed one prior pending order, run generation, confirm the input block contains it with age and status and the saved repeat carries `ageWeeks >= 1`; with no prior orders the output is unchanged.

- [X] T008 [US1] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, add a loader (next to `_loadPreviousAnalysis`) that gets `getLatest(MAX_LOOKBACK_WEEKS + 2)` and `getByDate` for each completed date before the target, returning `{ date, status, positionChanges, orders[], confirmationItems[] }`; on any error log a warning and fall back to an empty list (treat as no prior orders, FR-011).
- [X] T009 [US1] In the same file, call `PendingOrderTracker.build` after the loader and add a `## pendingOrders` section to `_buildUserMessage` (JSON array of `{ broker, symbol, side, quantity, ageWeeks, status, reason }` plus the numeric `MAX_CONSECUTIVE_ISSUES` value; empty array when none). Never type the threshold number into prompt prose (FR-006).
- [X] T010 [US1] In the same file, stamp each order the model returns that matches a `fresh` chain key with `ageWeeks = chain.ageWeeks` when building `SuggestedOrder` instances (new orders get `0`), and mention the carry-over age in no other place (label is code-derived).
- [X] T011 [P] [US1] Document the `pendingOrders` block in `src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md` (one short bullet in the inputs list and one line in the Week-over-week guidance: address pending orders by reference to the block, do not restate the threshold number; also tell the model not to list items marked `stale` or `likely-filled` in Suggested Actions, since the system lists them as confirmation items).
- [X] T012 [P] [US1] Persist and read `ageWeeks` in `src/infrastructure/repositories/AzureAnalysisRepository.js` (order row write and read mapping; absent column reads as `0`).
- [X] T013 [US1] Expose `ageWeeks` on each order in `src/functions/getWeeklyAnalysis.js` and in the MCP `get_weekly_analysis` output in `src/functions/mcp.js` per `contracts/weekly-analysis-api.md`.
- [X] T014 [US1] Use-case test `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.pendingOrders.test.js`: prior pending order appears in the user message with age and status; the repeated order is saved with `ageWeeks >= 1`; first run with no prior orders yields an empty block and unchanged output; loader failure degrades to no prior orders without throwing.
- [X] T015 [P] [US1] Update `tests/unit/functions/mcp.test.js` and the getWeeklyAnalysis function test (create `tests/unit/functions/getWeeklyAnalysis.test.js` if absent) to assert `ageWeeks` is present and `0` for old rows.

**Checkpoint**: US1 works alone; carry-overs are visible and aged.

---

## Phase 4: User Story 2 - Orders pending too long are escalated (Priority: P1)

**Goal**: orders already pending in 3 consecutive weeks, or with a visible fill (FR-013), are never re-issued as normal orders; they become confirmation items that persist until resolved (FR-014).

**Independent Test**: seed 3 consecutive pending weeks, stub the model to repeat the order, confirm the saved `orders` omits it and `confirmationItems` has one `stale` entry with `lastDate`/`lastIndex`; run the following week and confirm the item is still listed; mark the pointed row `skipped` and confirm it disappears.

- [X] T016 [US2] In `GenerateWeeklyAnalysis.js`, after the model returns, drop from `llmResult.orders` any order whose key matches a chain with `reason` `stale` or `likely-filled`, and build `confirmationItems` from those chains (`quantity` from `lastQuantity`, `reason`, `proposedStatus`, `lastDate`, `lastIndex`; items carried forward from the prior analysis keep their original `lastDate`/`lastIndex`); include chains the model did not repeat, so the owner still sees them. Re-index the surviving orders contiguously from 0.
- [X] T017 [US2] Pass `confirmationItems` into the `WeeklyAnalysis` constructor in the same file; on the failed-run path persist `[]`.
- [X] T018 [P] [US2] Persist and read `confirmationItemsJson` in `src/infrastructure/repositories/AzureAnalysisRepository.js` (`[]` when none; absent on old rows reads as `[]`, malformed JSON falls back to `[]` with a warning like the other JSON columns).
- [X] T019 [US2] Expose `confirmationItems` in `src/functions/getWeeklyAnalysis.js` and the MCP `get_weekly_analysis` in `src/functions/mcp.js` per the contract (`[]` for old rows).
- [X] T020 [US2] Use-case test (append to `GenerateWeeklyAnalysis.pendingOrders.test.js`): 3 pending weeks plus a model repeat yields no normal order and one `stale` item with `ageWeeks = 3`; 2 weeks yields a labelled carry-over and no item; the item is still listed the next two weeks even when the model does not repeat it, and a model repeat then is still not saved as a normal order (FR-014, no 4-week cycle); marking the row at `lastDate`/`lastIndex` `executed` or `skipped` (including a "still wanted" note) removes it next run and a fresh order then has `ageWeeks = 0`; re-running the same date gives identical orders and items (idempotence); replay of 8 observed pending weeks yields exactly one item and no normal order for that key (SC-001, SC-002).
- [X] T021 [P] [US2] Repository test in `tests/unit/infrastructure/repositories/` (extend the existing analysis repository test, or add `AzureAnalysisRepository.confirmationItems.test.js`): round trip of `ageWeeks` and `confirmationItemsJson`, old rows read back as `0` and `[]`.
- [X] T022 [P] [US2] Dashboard: in `dashboard/src/lib/analysis-detail/orders.js` and the analysis detail page component that consumes it, add an `ageWeeks` badge on orders with `ageWeeks >= 1` and a "needs your confirmation" panel listing `confirmationItems` (symbol, broker, side, age, reason, proposed status, and the `lastDate`/`lastIndex` of the row to resolve, with hint text: record `skipped` with a note such as "still wanted" to keep it). No new write path; the owner resolves via the existing execution-status control. Add or extend the matching dashboard unit test. (Done without a unit test: the dashboard has no DOM test harness and constitution IV leaves frontend visuals untested.)

**Checkpoint**: US2 works; no silent repeats past week 3.

---

## Phase 5: User Story 3 - Fills are inferred from position changes (Priority: P2)

**Goal**: pending orders whose fill is visible in later position changes get an `executed` or `partial` proposal across weeks, display-only.

**Independent Test**: pending buy in week W, later week has a matching increase; the read path proposes `executed`; smaller increase proposes `partial`; no match leaves it pending.

- [X] T023 [US3] In `GenerateWeeklyAnalysis.js`, feed each chain's `proposedStatus` from `OrderExecutionMatcher.proposeAcrossWeeks` (using the completed weeks after the chain's `originDate`) into `PendingOrderTracker.build` via its input, so `likely-filled` is set; chains with no proposal stay `fresh` or `stale` by age.
- [X] T024 [US3] In `src/functions/getWeeklyAnalysis.js`, replace the single-week `OrderExecutionMatcher.propose` call for pending orders with `proposeAcrossWeeks` over completed weeks strictly after the order's own date (`getLatest(MAX_LOOKBACK_WEEKS + 2)` filtered to dates `>` the order's date; a change in the issue week predates the order); check feature 007's single-week behaviour first and note whether it was intentional; keep the field name `proposedStatus` and the display-only behaviour; no write occurs.
- [X] T025 [US3] Tests: extend `GenerateWeeklyAnalysis.pendingOrders.test.js` for a `likely-filled` item (not re-issued even at age 1, `proposedStatus` set, FR-013) and `partial`; add the read-path cases to `tests/unit/functions/getWeeklyAnalysis.test.js` (cross-week `executed`, `partial`, none stays pending, unknown weeks ignored, nothing saved).

**Checkpoint**: all three stories independent and passing.

---

## Phase 6: Polish and cross-cutting

- [X] T026 [P] Run the whole `quickstart.md` flow: `npx jest` for the listed files, then the replay and read-path checks; fix gaps.
- [X] T027 [P] Run the full suite `npm test` and confirm green; fix or delete any red test in the same PR (constitution IV).
- [X] T028 [P] Update `docs/architecture/` or the analysis docs only if an existing page describes order handling (search first; skip when none), using placeholders only. (Searched: only `docs/roadmap-2026-07.md` mentions orders, as backlog; no page describes order handling, so no edit.)
- [X] T029 Privacy pass before staging: grep the diff for real symbols, quantities and prices; stage explicit paths only (no `git add -f`, `-A`, `.`); confirm the privacy scan passes.
- [ ] T030 Open the PR from `020-stale-order-handling` with the commit subjects in `<type>: <imperative>` form; note in the description that the `weekly-rebalance-v1.md` change is a committed-prompt change and that the owner-edited instructions document needs no edit.

---

## Dependencies and Execution Order

- Phase 1 first. Phase 2 blocks everything: T004 needs none of T002/T003; T006 needs T004; T007 needs T005; T008 onward need T002 to T005.
- US1 (Phase 3) is the MVP and needs Phase 2. US2 needs US1's loader and block (T008, T009) and T003. US3 needs T005 and T008 and refines T016's inputs (T023), so it follows US2.
- Within a story: loader and block before stamping/filtering; repository tasks (T012, T018) parallel to use-case code; tests after their code.
- Same-file serial chain in `GenerateWeeklyAnalysis.js`: T008, T009, T010, T016, T017, T023. Same for `getWeeklyAnalysis.js`: T013, T019, T024. Same for `AzureAnalysisRepository.js`: T012 then T018.

## Parallel Examples

- Foundational: T002, T003, T005 together, then T006 and T007 together once their targets exist.
- US1: T011, T012 alongside T008 to T010; T015 alongside T014.
- US2: T018, T021, T022 together once T016 and T017 fix the shapes.
- Polish: T026, T027, T028 together.

## Implementation Strategy

1. **MVP** = Phase 1, Phase 2, Phase 3 (US1): aged, labelled carry-overs visible to the model and the owner.
2. Add US2 to close the defect (no silent repeats past week 3). This is the minimum shippable fix for SC-001 and SC-002; consider releasing after US2.
3. Add US3 for fill inference and the cross-week proposals.
4. Each phase ends at a checkpoint that must be green before the next begins.
