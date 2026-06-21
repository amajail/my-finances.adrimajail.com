---
description: "Task list for feature 013 — administrative / non-investable positions"
---

# Tasks: Administrative / non-investable positions

**Input**: Design documents from `/specs/013-administrative-positions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-additions.md

**Tests**: Included — the drift-exclusion is a business rule; unit tests are requested.

**Sequencing**: Independent of 012/014/015 — can be built, tested, and merged on its own (first of
the three sibling features).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files)
- **[Story]**: US1 (exclude from drift/caps) / US2 (surface section) / US3 (narrative stops flagging)

---

## Phase 1: Setup

_None — existing project; no new deps or tooling._

## Phase 2: Foundational — snapshot partition (BLOCKS all stories)

**Purpose**: the single classification step every story builds on.

- [ ] T001 In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, after the snapshot is
  built (`_snapshotFromSummary`), partition it once into `investableSnapshot` (`Number(valueUsd) > 0`)
  and `administrativePositions` (`Number(valueUsd) <= 0`, i.e. zero OR negative). (data-model.md
  classification rule). No behaviour change yet beyond computing the two arrays.

**Checkpoint**: partition available to all stories.

---

## Phase 3: User Story 1 — Drift & caps ignore stubs (Priority: P1) 🎯 MVP

**Goal**: Feed only the investable set to drift/caps/position-change computations; the stub-driven
"unclassified" row disappears and value-bearing percentages are unchanged.

**Independent Test**: A portfolio with a `valueUsd<=0` stub yields drift with no stub-driven
`unclassified` row; value-bearing rows' `currentPct` match a baseline without the stub.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [ ] T002 [P] [US1] Extend `tests/unit/domain/services/AllocationDriftCalculator.test.js`: a
  `valueUsd: 0` (and a negative-value) position passed to `computeDrift` does not appear as an
  `unclassified` row and does not alter value-bearing percentages. (The calculator stays pure;
  exclusion happens upstream — so this test feeds it the already-filtered set and asserts no
  stub-driven unclassified row.)
- [ ] T003 [P] [US1] Add a use-case-level test asserting the partition feeds only `investableSnapshot`
  to `AllocationDriftCalculator.computeDrift` / `computeConcentrationCaps` / `PositionChangeCalculator.diff`.

### Implementation for User Story 1

- [ ] T004 [US1] In `GenerateWeeklyAnalysis.js`, pass `investableSnapshot` (not the full snapshot) to
  `AllocationDriftCalculator.computeDrift`, `AllocationDriftCalculator.computeConcentrationCaps`, and
  `PositionChangeCalculator.diff`. `AllocationDriftCalculator` itself is UNCHANGED (stays pure).
  Make T002/T003 pass. (FR-002, FR-003, FR-004; SC-001, SC-002)

**Checkpoint**: drift/caps clean; this is the core correctness fix (MVP).

---

## Phase 4: User Story 2 — Surface administrative section (Priority: P2)

**Goal**: Persist + serve + render the administrative positions; preserve cash/deposit as investable.

**Independent Test**: A run with a stub exposes `administrativePositions` in the detail response and
renders the table; a cash/null-price-but-positive holding is NOT there; none → omitted; pre-feature
row → no section, no error.

### Implementation for User Story 2

- [ ] T005 [US2] In `src/domain/entities/WeeklyAnalysis.js`, add optional `_administrativePositions`
  field (validate as object-array, getter, freeze, include in `toJSON()`), reusing the
  `PortfolioSnapshotPosition` typedef; mirror the feature-006/010 optional-section pattern.
- [ ] T006 [US2] In `src/infrastructure/repositories/AzureAnalysisRepository.js`, write
  `administrativePositionsJson` when non-empty and parse it back (mirror `positionChangesJson`).
- [ ] T007 [US2] In `GenerateWeeklyAnalysis.js`, pass `administrativePositions` to the
  `WeeklyAnalysis` constructor and the `captured` failure object. (FR-006, FR-007)
- [ ] T008 [P] [US2] In `dashboard/src/pages/analysis-detail.astro`, add an "Administrative /
  non-investable" table rendered from `administrativePositions`, mirroring the positionChanges
  table; omit when null/empty; escape all values. (FR-009)
- [ ] T009 [US2] Verify SC-004: a holding with `currentPrice: null` but positive `valueUsd`
  (cash/deposit) stays investable and is NOT in `administrativePositions` (covered by T003 fixture
  plus a quickstart check).

**Checkpoint**: stubs visible + persisted; value-bearing holdings unaffected.

---

## Phase 5: User Story 3 — Narrative stops flagging stubs (Priority: P3)

**Goal**: The narrative no longer raises the stubs as review items.

**Independent Test**: A run with a known stub produces a narrative/watchlist that does not raise it.

### Implementation for User Story 3

- [ ] T010 [US3] In `GenerateWeeklyAnalysis._buildUserMessage`, build `## currentHoldings` from the
  investable set only and add a compact `## administrativePositions` block labeled "excluded
  zero-value stubs — do not flag for review"; omit when none. (FR-010; clarify 2026-06-21)

**Checkpoint**: all three stories functional.

---

## Phase 6: Polish

- [ ] T011 Run `specs/013-administrative-positions/quickstart.md` acceptance checks end-to-end
  (generate on :7071; inspect `administrativePositions` + `driftByBucket`; open the dashboard table;
  open a pre-feature analysis to confirm backward-compat render).
- [ ] T012 `npm test` green; `cd dashboard && npm run build` succeeds.
- [ ] T013 Privacy self-review of the diff (tests/docs use placeholders only).

---

## Dependencies & Execution Order

- T001 (partition) is foundational — BLOCKS US1/US2/US3.
- US1: T002, T003 (tests) before T004 (impl). T004 is the MVP correctness fix.
- US2: T005, T006, T008 independent ([P] where different files); T007 depends on T001 + T005.
- US3: T010 depends on T001 (needs the partition) and edits `_buildUserMessage`.
- T004, T007, T010 all edit `GenerateWeeklyAnalysis.js` → keep sequential.
- Polish after desired stories.

## Notes

- `AllocationDriftCalculator` stays a pure function — exclusion is an upstream partition, so no
  value-bearing percentage changes (only the spurious unclassified row disappears).
- `valueUsd <= 0` (zero OR negative); null-price-but-positive (cash/deposit) is NOT administrative.
- No new deps/tables/data source/model change; backward compatible.
- Commit after each logical group; `feat:`/`test:`/`docs:` prefixes.
