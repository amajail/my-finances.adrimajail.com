---
description: "Task list for feature 019 — earmarked positions in the weekly analysis payload"
---

# Tasks: Earmarked positions in the weekly analysis payload

**Input**: Design documents from `/specs/019-earmarked-positions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/prompt-additions.md,
quickstart.md

**Tests**: Included — the exclusion/partition/persistence rules are business logic; unit tests are
requested (mirroring the feature-013 `administrativePositions` test suite).

**Sequencing**: Independent of any other in-flight feature; backend-only, no dashboard/API changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (drift/caps/duplications exclude the reserve) / US2 (reserve reported as its own
  line) / US3 (week-over-week stays apples-to-apples) / US4 (broker designation is configurable)

---

## Phase 1: Setup

_None — existing project; no new deps, tables, or tooling._

## Phase 2: Foundational — earmarked-broker config + three-way snapshot partition (BLOCKS all stories)

**Purpose**: the single classification step every story builds on. Because
`AllocationDriftCalculator`, `DuplicateHoldingsDetector`, and `PositionChangeCalculator` already
consume the existing `investableSnapshot` variable unchanged, redefining what that variable
excludes here automatically satisfies most of User Story 1 for free — US1's own phase below is
verification, not new call-site changes.

- [x] T001 In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, read setting
  `analysis.earmarkedBrokers` via the existing `_getSetting` helper (default `'cash'`); parse the
  comma-separated value into a trimmed, non-empty broker-id array. **Discovered during
  implementation**: `_getSetting`/`AzureSettingsRepository.get()` collapse a stored literal empty
  string to "unset" (falls back to the default) — a storage-layer quirk, not something this
  feature can special-case. To fully disable earmarking, set the value to a single space (`" "`):
  it survives storage as truthy, then trims/filters here to an empty broker list. (data-model.md
  Configuration; research.md Decision 2)
- [x] T002 In the same file, change the snapshot partition (currently: `investableSnapshot` =
  `valueUsd > 0`, `administrativePositions` = `valueUsd <= 0`) to a three-way split evaluated in
  this order: `earmarkedPositions` = `broker ∈ earmarkedBrokers AND valueUsd > 0` (checked FIRST,
  using T001's list) → `administrativePositions` = remaining positions with `valueUsd <= 0`
  (existing feature-013 rule, unchanged for non-earmarked brokers) → `investableSnapshot` =
  everything else. Apply the identical `broker ∈ earmarkedBrokers` exclusion to the prior week's
  snapshot filter used for the position-change diff (`priorSnapshot`), so both sides of that diff
  stay consistent from this task onward. (data-model.md Classification rule; research.md
  Decision 1 & Decision 3)

**Checkpoint**: `earmarkedPositions`/`administrativePositions`/`investableSnapshot` all available;
drift, caps, duplications, and both sides of the position-change diff already consume the
now-correctly-shrunk `investableSnapshot`/`priorSnapshot` with zero further call-site changes.

---

## Phase 3: User Story 1 — Allocation drift and caps measure invested capital only (Priority: P1) 🎯 MVP

**Goal**: Confirm that an earmarked-broker position never contributes to allocation-drift,
concentration-cap, or duplicate-holdings figures, and that every other holding's percentages are
unaffected — this is the core correctness fix.

**Independent Test**: A portfolio with a positive-value position at the designated earmarked
broker yields drift/caps/duplications identical to a baseline run with that position removed
entirely.

### Tests for User Story 1 ⚠️ (write first, ensure they fail before Phase 2 lands)

- [x] T003 [P] [US1] New test file
  `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.earmarkedPositions.test.js`:
  assert that `AllocationDriftCalculator.computeDrift`, `.computeConcentrationCaps`, and
  `DuplicateHoldingsDetector.detect` are each invoked with a positions array that excludes a
  fixture earmarked-broker position, and that a non-earmarked holding's resulting percentages are
  identical to a baseline run without the earmarked position present. (FR-002; SC-001)

### Implementation for User Story 1

- [x] T004 [US1] No additional call-site change required beyond T002 — `AllocationDriftCalculator`,
  `DuplicateHoldingsDetector`, and their inputs remain UNCHANGED (pure functions); the exclusion is
  entirely upstream. Run T003 against the Phase 2 implementation and fix T002 if it fails.

**Checkpoint**: drift/caps/duplications are clean of the earmarked position; MVP correctness fix
in place.

---

## Phase 4: User Story 2 — The reserve is reported as its own line, not hidden (Priority: P1)

**Goal**: Persist, and feed to the model, a distinct `earmarkedPositions` section with the
combined total — never folded into ordinary holdings, never silently dropped.

**Independent Test**: A run with an earmarked-broker position produces a distinct
`earmarkedPositions` array + prompt block with the correct total; a run without any omits both.

### Tests for User Story 2 ⚠️ (write first, ensure they fail)

- [x] T005 [P] [US2] Extend
  `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.earmarkedPositions.test.js`:
  assert `earmarkedPositions` contains exactly the fixture's positive-value earmarked-broker
  position(s) and no others; assert it is excluded from the `## currentHoldings` prompt block;
  assert the `## earmarkedPositions` prompt block is present with the correct JSON + `totalUsd`
  when non-empty and absent entirely when empty; assert the fixed instruction text names no
  specific real-world purpose (FR-009 guard). Also include a fixture position at the earmarked
  broker with `valueUsd <= 0` (zero or negative) and assert it appears in
  `administrativePositions`, not `earmarkedPositions` — the FR-006 edge case (a value-less
  position at an earmarked broker must NOT be misclassified as earmarked). (FR-003, FR-004,
  FR-006, FR-008, FR-009; SC-002)
- [x] T006 [P] [US2] New test file
  `tests/unit/domain/entities/WeeklyAnalysis.earmarkedPositions.test.js`: `earmarkedPositions`
  defaults to `[]`; accepts an array of position-shaped objects; validation rejects a non-object
  entry; the field is frozen and appears in `toJSON()`. Mirror
  `WeeklyAnalysis.administrativePositions.test.js` structure.
- [x] T007 [P] [US2] New test file
  `tests/unit/infrastructure/repositories/AzureAnalysisRepository.earmarkedPositions.test.js`:
  `earmarkedPositionsJson` is written only when the array is non-empty; reads back correctly;
  absent column on a pre-feature row reads back as `[]`. Include a case constructing a
  `WeeklyAnalysis` with `status: 'failed'` and a non-empty `earmarkedPositions` array and
  asserting it round-trips through the repository (write + read back) exactly like a completed
  run's — the FR-007 failure-path requirement. Mirror
  `AzureAnalysisRepository.administrativePositions.test.js` structure.

### Implementation for User Story 2

- [x] T008 [P] [US2] In `src/domain/entities/WeeklyAnalysis.js`, add optional
  `_earmarkedPositions` field: constructor default `[]`, validation (each entry a non-array
  object, same loop as `administrativePositions`), `Object.freeze`, getter, and inclusion in
  `toJSON()` — exact mirror of the existing `_administrativePositions` handling. (data-model.md
  Entity: WeeklyAnalysis)
- [x] T009 [P] [US2] In `src/infrastructure/repositories/AzureAnalysisRepository.js`, write
  `earmarkedPositionsJson` when the array is non-empty (mirroring the
  `administrativePositionsJson` write) and parse it back with the existing JSON-column parser,
  defaulting to `[]` when absent (mirroring the `administrativePositionsJson` read).
- [x] T010 [US2] In `GenerateWeeklyAnalysis.js`, pass `earmarkedPositions` through to the
  `WeeklyAnalysis` constructor call and to the `_persistFailed` capture object (depends on T002,
  T008). (FR-007)
- [x] T011 [US2] In `GenerateWeeklyAnalysis._buildUserMessage`, exclude earmarked positions from
  the `## currentHoldings` block (mirroring the existing administrative-position exclusion there)
  and add a new `## earmarkedPositions` block — JSON array + combined `totalUsd`, fixed generic
  instruction text (exclude from invested-capital reasoning; report as a separate line; never
  suggest deploying/trimming/selling; no named real-world purpose) — omitted entirely when empty.
  Make T005 pass. (contracts/prompt-additions.md §2; FR-003, FR-004, FR-008, FR-009)

**Checkpoint**: earmarked positions are visible, persisted, and correctly excluded from the
narrative's ordinary holdings view — both P1 stories complete (MVP).

---

## Phase 5: User Story 3 — Week-over-week comparisons stay apples-to-apples (Priority: P2)

**Goal**: An earmarked position's presence, absence, or value change never produces a
position-change entry.

**Independent Test**: Across two consecutive runs where the earmarked position's value changes
between them, the position-change comparison shows no entry for it in either run.

### Tests for User Story 3 ⚠️ (write first, ensure they fail)

- [x] T012 [P] [US3] Extend
  `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.earmarkedPositions.test.js`:
  given a prior snapshot and current snapshot that both include an earmarked-broker position with
  different values, `positionChanges` contains no entry for it; given a prior snapshot without an
  earmarked position and a current snapshot that has one (newly configured), `positionChanges`
  contains no "added" entry for it. (FR-005; SC-003)

### Implementation for User Story 3

- [x] T013 [US3] Verify `PositionChangeCalculator.diff` receives both the current and prior
  snapshots already filtered per T002's `priorSnapshot` exclusion; no changes to
  `PositionChangeCalculator` itself. Make T012 pass — if it fails, the fix belongs in T002's
  `priorSnapshot` filter, not here. (research.md Decision 3)

**Checkpoint**: week-over-week comparisons never surface the earmarked reserve as a portfolio move.

---

## Phase 6: User Story 4 — The reserve designation is configurable without a code change (Priority: P3)

**Goal**: Owner can change or clear which broker(s) are earmarked via settings alone.

**Independent Test**: Changing `analysis.earmarkedBrokers` to a different broker (or clearing it)
changes which positions are earmarked on the very next analysis run, with no code change.

### Tests for User Story 4 ⚠️ (write first, ensure they fail)

- [x] T014 [P] [US4] Extend
  `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.earmarkedPositions.test.js`:
  with `analysis.earmarkedBrokers` unset, only the default `'cash'` broker's positive-value
  positions are earmarked; with it set to a different broker (or a multi-broker list), exactly
  those broker(s)' positions are earmarked and `'cash'` positions become ordinary investable
  holdings; with it set to a whitespace value (`" "` — see T001 note: the settings repository
  collapses a literal empty string to "unset," so a space is the documented way to disable
  earmarking entirely), no positions are earmarked and the `## earmarkedPositions` block is
  entirely absent. (FR-001; SC-004)

### Implementation for User Story 4

- [x] T015 [US4] Verify T001's setting-read + parse logic satisfies all three T014 cases; no
  further code change expected (this phase validates Foundational work under the story's
  acceptance lens).

**Checkpoint**: all four user stories independently functional.

---

## Phase 7: Polish

- [ ] T016 Run `specs/019-earmarked-positions/quickstart.md` acceptance checks end-to-end (set/clear
  `analysis.earmarkedBrokers` via the settings endpoint; generate an analysis; confirm drift/caps/
  duplications/position-changes/prompt-block behavior per the spec's Success Criteria).
- [x] T017 `npm test` green (full suite, incl. all `GenerateWeeklyAnalysis`,
  `WeeklyAnalysis`, and `AzureAnalysisRepository` tests — new and pre-existing).
- [x] T018 Privacy self-review of the diff: tests/docs use placeholder brokers/symbols/values only
  (no real broker names, quantities, or dollar amounts); the fixed prompt-block text names no
  real-world earmark purpose (FR-009).

---

## Dependencies & Execution Order

- T001, T002 (Foundational) — BLOCK every user-story phase. T002 depends on T001 (needs the parsed
  broker list).
- US1 (T003–T004): T003 (test) depends only on Foundational; T004 is verification, not new code.
- US2 (T005–T011): T005–T007 (tests) can run in parallel with each other once Foundational lands;
  T008 and T009 are independent file edits ([P]); T010 depends on T002 + T008; T011 depends on
  T002 + T010 (same file, sequential within `GenerateWeeklyAnalysis.js`).
- US3 (T012–T013): depends on Foundational only (T002's `priorSnapshot` exclusion); independent of
  US1/US2.
- US4 (T014–T015): depends on Foundational only (T001); independent of US1/US2/US3.
- T004, T010, T011, T013, T015 all touch or verify `GenerateWeeklyAnalysis.js` — sequence edits to
  that file to avoid conflicting diffs even though they're logically independent.
- Polish (T016–T018) after all four stories.

## Parallel Example: Foundational → User Story 2

```bash
# Once T001+T002 land, these can proceed in parallel (different files):
Task: "New test file GenerateWeeklyAnalysis.earmarkedPositions.test.js — earmarkedPositions + prompt block assertions (T005)"
Task: "New test file WeeklyAnalysis.earmarkedPositions.test.js (T006)"
Task: "New test file AzureAnalysisRepository.earmarkedPositions.test.js (T007)"
Task: "Add _earmarkedPositions field to WeeklyAnalysis.js (T008)"
Task: "Add earmarkedPositionsJson column to AzureAnalysisRepository.js (T009)"
```

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Complete Phase 1 (none) + Phase 2: Foundational (settings read + three-way partition).
2. Complete Phase 3: User Story 1 — verify drift/caps/duplications exclusion.
3. Complete Phase 4: User Story 2 — persist + surface the reserve as its own line.
4. **STOP and VALIDATE**: both P1 stories together are the MVP — correctness (US1) without
   visibility (US2) would hide real money from the owner; ship them as one unit.

### Incremental Delivery

1. Foundational → US1 → US2 (MVP: correct drift math + visible reserve line).
2. Add US3 (week-over-week hygiene) → test independently.
3. Add US4 (configurability) → test independently.
4. Polish.

## Notes

- The Foundational partition (T002) does most of US1's and half of US3's work by construction,
  because `AllocationDriftCalculator`, `DuplicateHoldingsDetector`, and
  `PositionChangeCalculator` already consume the `investableSnapshot`/`priorSnapshot` variables
  unchanged — none of those three pure domain services are touched by this feature.
- Zero-or-negative-value positions at an earmarked broker remain administrative, never earmarked
  (FR-006) — verified implicitly by T002's ordering and explicitly by the fixture T005 now
  requires (a `valueUsd <= 0` position at an earmarked broker asserted into
  `administrativePositions`).
- No new tables, endpoints, or npm dependencies; backward compatible (pre-feature rows read
  `earmarkedPositions` back as `[]`, same convention as `administrativePositions`).
- SC-005 ("no suggested action ever recommends deploying/trimming/selling an earmarked
  position") is enforced by the fixed prompt instruction in T011, not by a unit test — it is an
  LLM-behavior outcome no unit test can deterministically guarantee, the same characteristic as
  sibling feature 013's SC-006 ("narrative stops flagging"), which was accepted without a
  dedicated test task either. Not a gap to close before implementation.
- Commit after each logical group; `feat:`/`test:`/`docs:` prefixes per repo convention.
