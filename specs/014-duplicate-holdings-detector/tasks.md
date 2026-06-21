---
description: "Task list for feature 014 — cross-broker duplicate-holdings detector"
---

# Tasks: Cross-broker duplicate-holdings detector

**Input**: Design documents from `/specs/014-duplicate-holdings-detector/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-additions.md

**Tests**: Included — the detector is pure business logic; unit tests are requested.

**Sequencing**: Wiring mirrors feature 012's `macroChanges`; best built after 012 merges so the
entity/repository/dashboard patterns it copies exist on `main`. The detector + its unit tests
(US1) are independent of 012 and can be built/tested first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files)
- **[Story]**: US1 (detect) / US2 (present+persist) / US3 (narrative defers)

---

## Phase 1: Setup

_None — existing project; no new deps or tooling._

## Phase 2: Foundational

_None blocking. The pure detector (US1) has no prerequisites; US2 wiring follows the established
feature-012 optional-section pattern._

---

## Phase 3: User Story 1 — Detect duplicate placements (Priority: P1) 🎯 MVP

**Goal**: A pure detector that returns the duplicate groups for a portfolio snapshot.

**Independent Test**: Unit tests over fixture snapshots produce the correct groups/ordering.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [ ] T001 [P] [US1] Create `tests/unit/domain/services/DuplicateHoldingsDetector.test.js` mirroring
  `PositionChangeCalculator.test.js`, covering: same symbol at two brokers (same wrapper) → 1 group;
  same symbol two wrappers (e.g. stock+cedear) → 1 group; same symbol three placements → 1 group of
  3; all-unique → `[]`; cash assetType excluded; empty snapshot → `[]`; ordering by combined value
  desc with `symbol` asc tiebreak; non-positive-value placement does not crash ordering. Use fake
  symbols/values only.

### Implementation for User Story 1

- [ ] T002 [US1] Create `src/domain/services/DuplicateHoldingsDetector.js` — pure static
  `detect(snapshot)`: filter cash-like asset types, group by normalized `symbol`, collapse repeated
  `(broker, assetType)` placements, keep groups with ≥ 2 distinct placements, compute
  `placementCount` + `totalValueUsd`, sort by `totalValueUsd` desc then `symbol` asc, return `[]`
  when none. (data-model.md detection rule). Make T001 pass.

**Checkpoint**: detector fully functional + unit-tested in isolation (MVP).

---

## Phase 4: User Story 2 — Persist & present duplicates (Priority: P2)

**Goal**: Carry the detector output through the analysis aggregate, persistence, API, and dashboard.

**Independent Test**: A generated analysis with a known duplicate exposes `duplications` in the
detail response and renders the table; none → omitted; pre-feature row → no section, no error.

### Implementation for User Story 2

- [ ] T003 [US2] In `src/domain/entities/WeeklyAnalysis.js`, add optional `_duplications` field
  (validate as object-array, getter, freeze, include in `toJSON()`), mirroring `macroChanges`.
- [ ] T004 [US2] In `src/infrastructure/repositories/AzureAnalysisRepository.js`, write
  `duplicationsJson` when non-empty and parse it back (mirror `macroChangesJson` to/from-entity).
- [ ] T005 [US2] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, declare
  `duplications`, compute `DuplicateHoldingsDetector.detect(investableSnapshot)` next to
  `positionChanges`/`macroChanges`, pass it to the `WeeklyAnalysis` constructor and the `captured`
  failure object. (If feature 013 is present, use its investable snapshot; else the full snapshot.)
- [ ] T006 [P] [US2] In `dashboard/src/pages/analysis-detail.astro`, add a "Duplicate holdings"
  table + `renderDuplications()` called from `load()`, mirroring `renderMacroWow()`; omit when
  null/empty. Escape all rendered values.

**Checkpoint**: duplicates detected, persisted, served, and rendered.

---

## Phase 5: User Story 3 — Narrative defers to the section (Priority: P3)

**Goal**: The narrative no longer re-enumerates duplicates item-by-item.

**Independent Test**: A run with a known duplicate produces a narrative that references but does not
list the duplicate placements.

### Implementation for User Story 3

- [ ] T007 [US3] In `GenerateWeeklyAnalysis._buildUserMessage`, add a compact `## duplications`
  block (labeled deterministically detected) with an instruction not to re-enumerate; omit when
  none. (FR-012; consistent with feature 013's labeled-block decision.)

**Checkpoint**: all three stories functional.

---

## Phase 6: Polish

- [ ] T008 Run `specs/014-duplicate-holdings-detector/quickstart.md` acceptance checks end-to-end
  (generate locally on :7071, inspect `.duplications`, open the dashboard table).
- [ ] T009 `npm test` green; `cd dashboard && npm run build` succeeds.
- [ ] T010 Privacy self-review of the diff (tests/docs use placeholders only).

---

## Dependencies & Execution Order

- US1 (T001→T002) first and standalone (MVP); T001 before T002 (tests fail first).
- US2 needs the detector (T002). Within US2: T003, T004, T006 are independent ([P] where different
  files); T005 depends on T002 + T003 (constructs the entity with the field).
- US3 (T007) depends on T002 (needs detector output) and touches `_buildUserMessage`.
- T005 and T007 both edit `GenerateWeeklyAnalysis.js` → sequential.
- Polish after desired stories.

## Notes

- Mirrors feature-006/012 pure-service + optional-section conventions throughout.
- No new deps/tables/data source/model change; backward compatible.
- Commit after each logical group; `feat:`/`test:`/`docs:` prefixes.
