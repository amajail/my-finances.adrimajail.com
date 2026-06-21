# Tasks: Macro Week-over-Week Comparison

**Input**: Design documents from `/specs/012-macro-week-over-week/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included for backend logic (Constitution Principle IV — calculator, entity validation, repository round-trip). Astro rendering exempt.

**Organization**: One user story (P1) — the whole feature is a single behavior change. Phase 2 is the story; Phase 3 is polish/verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task
- **[Story]**: US1 (Polish carries no story label)

## Shared-file note

`GenerateWeeklyAnalysis.js` (T007), `analysis-detail.astro` (T009), and the API/repo/entity files are each touched once. Dependency chain: calculator (T001) + entity (T003) → wire (T007); entity (T003) → repo column (T005) + API (T008); API (T008) + data (T005/T007) → render (T009).

---

## Phase 1: Setup

No project setup or new infrastructure (no new deps/tables/settings).

---

## Phase 2: User Story 1 - See exactly how reserves (and macro) moved this week (Priority: P1) 🎯 MVP

**Goal**: A deterministic macro week-over-week table (prior → current → Δ → %) on each analysis that has a prior week, anchored on BCRA reserves and covering the numeric macro panel.

**Independent Test**: Open an analysis with a prior week → a "Macro — week over week" table shows one row per numeric indicator present in both weeks (incl. reserves) with prior/current/Δ/%/as-of; first-run and pre-feature analyses show it absent with no errors.

### Calculator

- [X] T001 [P] [US1] Create pure `MacroChangeCalculator` in `src/domain/services/MacroChangeCalculator.js` — `static diff(priorMacro, currentMacro)`: a `KEY_META` map of the 8 numeric keys → {label, unit} (riesgoPais/fxGap/bcraReserves/argInflation/argInterestRate/usaInflation/usaInterestRate/sp500Drawdown); return `null` when `priorMacro` is null/absent; per key include a row only when both prior+current readings exist, `available !== false`, and `value` is finite; compute `deltaAbs = current − prior` and `deltaPct = prior === 0 ? null : ((current−prior)/prior)*100` (rounded); carry label/unit/prior+asOf/current+asOf. Returns `MacroChangeRow[]` (possibly `[]`)
- [X] T002 [P] [US1] Unit tests for `MacroChangeCalculator` in `tests/unit/domain/services/MacroChangeCalculator.test.js` — diff math, reserves row present, skip when missing/unavailable on either side, `imfReviewStatus` (textual) excluded, `deltaPct === null` when prior is 0, `diff` returns null when prior macro absent, `[]` when no key qualifies

### Entity + persistence

- [X] T003 [US1] Add an optional `macroChanges` field to `src/domain/entities/WeeklyAnalysis.js` — constructor handling (`Array.isArray ? : null`), light "present → array of objects, else reject" validation, freeze, getter, and `toJSON`, mirroring `positionChanges`
- [X] T004 [P] [US1] Unit tests for the `macroChanges` field in `tests/unit/domain/entities/WeeklyAnalysis.macroChanges.test.js` — absent→null, `[]`→empty, valid array accepted, malformed (non-object entries)→ValidationError, toJSON round-trip
- [X] T005 [US1] Add a `macroChangesJson` column to `_analysisToEntity`/`_analysisFromEntity` in `src/infrastructure/repositories/AzureAnalysisRepository.js` — write only when non-null, parse with `_parseJsonColumn` (absent/malformed→null), per the feature-006/010 pattern
- [X] T006 [P] [US1] Round-trip unit test for `macroChangesJson` in `tests/unit/infrastructure/repositories/AzureAnalysisRepository.macroChanges.test.js` — write→read, absent column→null, malformed→null, and a re-run/replace case (present last week, null this week → dropped) (FR-012)

### Wiring + API + render

- [X] T007 [US1] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, compute `macroChanges = MacroChangeCalculator.diff(previousAnalysis ? previousAnalysis.macroContext : null, macroContext)` right after the `positionChanges` line, and attach it to the completed `WeeklyAnalysis` (also carry it onto the failed-path record if macro was captured, mirroring feature-006 capture buffers) (depends on T001, T003)
- [X] T008 [US1] Expose `macroChanges` in the `GET /api/analysis/weekly/{date}` response body in `src/functions/getWeeklyAnalysis.js` (alongside `positionChanges`/the feature-010 sections) per `contracts/api-additions.md` (depends on T003)
- [X] T009 [US1] Render a "Macro — week over week" `<section>` + render function in `dashboard/src/pages/analysis-detail.astro` — columns: indicator, prior, current, Δ (signed, colored), % (or "—" when null); shown only when `macroChanges` is present and non-empty; visually distinct from "Changes this week" (positions) and "Week-over-week (analytical)" (LLM) (FR-009) (depends on T008)

**Checkpoint**: US1 complete — deterministic macro comparison computed, persisted, and rendered; absent gracefully on first run / pre-feature rows.

---

## Phase 3: Polish & Verification

- [X] T010 [P] Run the full Jest suite (`npm test`) and the dashboard build (`cd dashboard && npm run build`); fix any failures (no red on `main`, Principle IV)
- [ ] T011 Live verify (needs two consecutive analyses): run the timer twice for different weeks → open the latest; confirm the "Macro — week over week" table shows the reserves row + other numeric indicators with `deltaAbs == current − prior`, and that the earliest/first-run analysis shows it absent (SC-001..SC-006). Per `quickstart.md`
- [X] T012 [P] Privacy check before push: confirm no real holdings/PPCs in committed files (this feature handles only public macro indicators + computed deltas; nothing personal) (Principle I)

---

## Dependencies & Execution Order

- **Phase 1**: none.
- **US1 (Phase 2)**: T001 (calculator) and T003 (entity) are independent → can land in parallel; T002/T004/T006 are [P] tests for their units. T005 (repo) needs T003. T007 (wire) needs T001 + T003. T008 (API) needs T003. T009 (render) needs T008 (+ T005/T007 for data to exist end-to-end).
- **Polish (Phase 3)**: after US1. T011 makes real paid runs (two of them) — run once at the end.

## Parallel opportunities

- **T001** (calculator) ‖ **T003** (entity) — distinct files.
- Tests **T002 / T004 / T006** run alongside their units.

```bash
# Representative parallel batch (distinct files):
Task: "T001 MacroChangeCalculator + T002 its tests"
Task: "T003 WeeklyAnalysis macroChanges field + T004 its tests"
```

## Implementation strategy

Single story = single increment. Build calculator + entity + persistence, wire into the run, expose + render, then verify with two consecutive live runs. No partial/MVP split needed.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- No new dependencies, tables, settings, tool-schema, or LLM involvement; charts + the LLM `weekOverWeek` section untouched (FR-013).
- Commit after each logical group (speckit work → commits authorized).
- T011 is the one paid step (two real runs needed for a prior-week comparison).
