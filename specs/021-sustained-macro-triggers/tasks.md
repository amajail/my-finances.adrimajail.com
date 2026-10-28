---

description: "Task list for sustained macro triggers (021)"
---

# Tasks: Sustained Macro Triggers

**Input**: Design documents from `/specs/021-sustained-macro-triggers/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/sustained-triggers.md, quickstart.md

**Tests**: Included. FR-015 requires tests for the day-count logic, and constitution IV requires tests for domain services and use-case orchestration. All test data is made-up macro numbers and `YYYY-MM-DD` dates; never real holdings.

**Organization**: grouped by user story. The evaluator is one file, so US1 builds its core and US2/US3 extend it in sequence (no `[P]` between them). Persistence and the read surface are Foundational because every story's output is stored and read through them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3 per spec.md

## Phase 1: Setup

- [X] T001 Confirm the baseline is green before changing anything: run `npm test` and `npm run lint` and note the result in the PR description (no file change).

---

## Phase 2: Foundational (blocks all user stories)

**Purpose**: carry a `sustainedTriggers` value from the entity to the database and back out through the API and MCP tool. Result shape: `data-model.md` (`SustainedTriggerResult`).

- [X] T002 [P] Add optional `sustainedTriggers` to `src/domain/entities/WeeklyAnalysis.js`: `this._sustainedTriggers = Array.isArray(data.sustainedTriggers) ? data.sustainedTriggers : null` (null on pre-feature rows and when not computed, same convention as `macroChanges`), `Object.freeze` it when non-null, a getter, and inclusion in both serialisation methods next to `macroChanges`. Validation: when present each item must be an object whose `status` is one of `met | building | not-satisfied | unknown | insufficient-history | not-evaluable`, whose `heldDays` is a non-negative integer, and whose `durationMet` is a boolean; otherwise push an error like the existing confirmation-item check.
- [X] T003 [P] Persist the column in `src/infrastructure/repositories/AzureAnalysisRepository.js`: write `entity.sustainedTriggersJson = JSON.stringify(wa.sustainedTriggers)` only when non-null (next to `macroChangesJson`), and read it back with `this._parseJsonColumn(entity.sustainedTriggersJson, entity.rowKey, 'sustainedTriggersJson', null)` passing `sustainedTriggers` into the `WeeklyAnalysis` constructor. No new table.
- [X] T004 [P] Return the field from the read path: add `sustainedTriggers: analysis.sustainedTriggers` beside `macroChanges` in the completed-analysis body of `src/functions/getWeeklyAnalysis.js`, and the same field in the equivalent body built by the `get_weekly_analysis` handler in `src/functions/mcp.js` (around line 190). Mention `sustainedTriggers` in that tool's description string so the tool listing stays accurate.
- [X] T005 [P] Repository round-trip test in `tests/unit/infrastructure/repositories/AzureAnalysisRepository.sustainedTriggers.test.js`, modelled on `AzureAnalysisRepository.pendingOrders.test.js`: rows with `sustainedTriggers` survive upsert then read; a row without the column reads back as `null`; a malformed JSON column reads back as `null` without throwing.
- [X] T006 [P] Extend `tests/integration/functions/getWeeklyAnalysis.test.js` (where that function's test lives) and `tests/unit/functions/mcp.test.js`: the response body carries `sustainedTriggers` for an analysis that has it and `null` for one that does not.

**Checkpoint**: the field round-trips through storage and both read surfaces; nothing computes it yet.

---

## Phase 3: User Story 1 - A sustained breach fires its trigger (Priority: P1) 🎯 MVP

**Goal**: the analysis knows how long each of the three conditions has held, sees that figure next to the current reading, and is told to report FIRED only when the duration is met.

**Independent Test**: seed prior analyses with country risk above 800 across 35 days plus a current reading above 800; the saved analysis has a `met` row with `heldDays` 35, and the message sent to the model contains the `## sustainedTriggers` block right after `## macroContext`. With 14 days the row is `building` with `daysRemaining` 16; with the current reading below 800 it is `not-satisfied` with `heldDays` 0.

### Tests for User Story 1

- [X] T007 [P] [US1] Evaluator unit tests in `tests/unit/domain/services/SustainedTriggerEvaluator.test.js` (this task creates the file; later stories append): 35 days above 800 gives `met` with `heldDays` 35 and `durationMet` true; 14 days gives `building`, `daysRemaining` 16, `durationMet` false; exactly 30 days gives `met` (`heldDays >= requiredDays`); 29 days gives `building`; a value exactly equal to 800 does not satisfy (strict `>`); current reading below the threshold gives `not-satisfied`, `heldDays` 0, whatever the history; a prior reading that violates the condition ends the streak and `streakStart` is the oldest satisfying observation after it; `fxGap` uses `> 50`; two analyses with the same reading date count as one observation (the later analysis wins); definitions come back in the fixed order `riesgoPais`, `fxGap`, `bcraReserves`.
- [X] T008 [P] [US1] Use-case wiring tests in `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.sustainedTriggers.test.js`, modelled on `GenerateWeeklyAnalysis.pendingOrders.test.js`: with seeded history the LLM client fake receives a user message whose `## sustainedTriggers` block follows `## macroContext` and contains `heldDays`, `durationMet` and the condition text; the analysis saved through the repository fake carries the same rows in `sustainedTriggers`; no holdings, quantities or prices appear inside the block.

### Implementation for User Story 1

- [X] T009 [US1] Create `src/domain/services/SustainedTriggerEvaluator.js` (pure, CommonJS, no I/O; export it from `src/domain/services/index.js` only if the other calculators in that barrel pattern are exported there, otherwise require it by path as `MacroChangeCalculator` is). Define `TRIGGERS` exactly per `data-model.md` `SustainedTriggerDefinition`: `riesgoPais` `>` 800 `bp` 30 days; `fxGap` `>` 50 `%` 30 days; `bcraReserves` `<` 0 `USD M` 30 days with `requiredBasis: 'net'`. Export `evaluate({ currentMacro, priorAnalyses })` returning one `SustainedTriggerResult` per definition in order, with the fields and status rules of `data-model.md`. Build observations from each prior analysis with `status === 'completed'` and `date < ` the current date, dated by the reading's `asOf` (falling back to the analysis `date`), one per date. Walk newest to oldest per `research.md` D3 for the satisfying and violating cases: stop at the first violating observation, `streakStart` = oldest satisfying observation, `heldDays` = whole days from `streakStart` to the current `asOf`, `durationMet` only when the current reading satisfies the condition and `heldDays >= requiredDays`, `daysRemaining = max(0, requiredDays - heldDays)` while `building` and `null` otherwise. Compare with strict `>` / `<`. Never throw on malformed input.
- [X] T010 [US1] Wire the evaluator into `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`: add a private `_loadPriorMacroHistory(targetDate)` shaped like `_loadPriorWeeksForOrders`: call `this._analysisRepository.getLatest(n)` with `n = Math.ceil(maxRequiredDays / 7) + 3` (8 for the current set), keep rows with `date < targetDate` and `status === 'completed'`, map to `{ date, status, macroContext }`; wrap in try/catch that logs a warning with only `errorType` and returns `[]`. Compute `sustainedTriggers = SustainedTriggerEvaluator.evaluate({ currentMacro: macroContext, priorAnalyses })` right after step 4b (`MacroChangeCalculator.diff`), declare `let sustainedTriggers = null` beside `macroChanges`, pass it through `capturedBase`, `_persistFailed` and the final `WeeklyAnalysis` construction exactly where `macroChanges` is passed.
- [X] T011 [US1] Add the prompt block in `_buildUserMessage` of `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`: take `sustainedTriggers = null` as a parameter (pass it from the call site next to `pendingChains`) and, immediately after the `## macroContext` section is pushed, when the array is non-empty push `## sustainedTriggers`, the instruction sentence from `contracts/sustained-triggers.md` §1, and one compact JSON array whose rows are `{key, current, asOf, condition, status, heldDays, daysRemaining, durationMet, includesUnknown, historyLimited, note}` (`condition` rendered like `> 800 bp for 30d`; drop `daysRemaining` and `note` when null). Omit the block when `macroContext` is unavailable.
- [X] T012 [P] [US1] Append rule 5 ("Respect `sustainedTriggers`") from `contracts/sustained-triggers.md` §2 to `src/application/use-cases/analysis/prompts/guardrail-preamble-v2.md`, keeping the numbered list and the closing "The owner-maintained instructions follow." line intact. Also add `sustained triggers` to rule 2's list of code-computed tables.
- [X] T013 [US1] Run `npx jest tests/unit/domain/services/SustainedTriggerEvaluator.test.js tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.sustainedTriggers.test.js` and fix until green; then `npx jest tests/unit/application/use-cases/analysis` to confirm no existing prompt snapshot or guardrail test broke (update an existing test only if it pins the exact preamble text, and say so in the commit).

**Checkpoint**: US1 works end to end for readings that are always available. MVP.

---

## Phase 4: User Story 2 - Missing data is unknown, never a reset (Priority: P1)

**Goal**: weeks with unavailable data neither reset a streak nor count as proof; a gross-basis BCRA reading is reported as not evaluable instead of "not satisfied".

**Independent Test**: seed a history where the condition holds, one week has the indicator unavailable, and it holds again afterwards; the streak continues across the gap with `includesUnknown` true and the same `heldDays` as the fully observed history.

### Tests for User Story 2

- [X] T014 [US2] Append to `tests/unit/domain/services/SustainedTriggerEvaluator.test.js`: an unavailable week between two satisfying weeks keeps the streak and sets `includesUnknown` true with the same `heldDays` as the fully observed history (SC-002); an unavailable week as the only evidence of the condition ending does not break the streak; unknown weeks at the old end of history add nothing (`streakStart` stays at the oldest satisfying observation); a prior analysis with `status: 'failed'`, a `null` `macroContext`, a missing indicator, a non-numeric value or `available: false` is ignored without throwing; the current reading unavailable gives `status: 'unknown'`, `durationMet` false and a `note`; a `bcraReserves` reading with `basis: 'gross'` gives `not-evaluable` with `durationMet` false and a note naming the basis mismatch, while a reading with `basis: 'net'` evaluates normally.

### Implementation for User Story 2

- [X] T015 [US2] Extend `src/domain/services/SustainedTriggerEvaluator.js`: classify each prior observation as satisfying, violating or unusable (a missing indicator, `available === false`, a non-finite number, a `null` `macroContext` or a non-completed analysis is unusable); unusable observations are skipped during the walk and never stop it; set `includesUnknown` when a skipped observation lies between the current reading and `streakStart`. Return `status: 'unknown'` with a `note` when the current reading is unusable. Return `status: 'not-evaluable'` with a note such as `reading basis is gross; net required` whenever a definition's `requiredBasis` is set and the current reading's `basis` differs; the same check applies to prior observations, which are unusable when their basis differs.
- [X] T016 [US2] Run `npx jest tests/unit/domain/services/SustainedTriggerEvaluator.test.js` until green.

**Checkpoint**: outages and the gross-reserves gap are handled honestly, and US1 behaviour is unchanged.

---

## Phase 5: User Story 3 - First run and thin history (Priority: P2)

**Goal**: an empty, short or unreadable history never crashes the run or produces a false FIRED, and a streak longer than the stored history is flagged as a lower bound.

**Independent Test**: run the analysis against an empty repository and against one whose `getLatest` throws; both complete, every satisfying trigger is `insufficient-history`, none is `durationMet`.

### Tests for User Story 3

- [X] T017 [P] [US3] Append to `tests/unit/domain/services/SustainedTriggerEvaluator.test.js`: no prior analyses gives `insufficient-history`, `heldDays` 0, `durationMet` false for a currently satisfying reading (FR-009, SC-003); history covering only 10 days of a 30-day trigger gives `building` with `daysRemaining` 20 and `historyLimited` true; a streak that runs to the oldest available observation sets `historyLimited` true; `priorAnalyses` of `undefined`, `null` or `[]` and a `currentMacro` of `null` all return rows without throwing.
- [X] T018 [P] [US3] Append to `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.sustainedTriggers.test.js`: with an empty analysis repository the run completes and the saved rows are `insufficient-history`; when `getLatest` rejects, the run still completes, every row is `insufficient-history`, and the logged warning contains no analysis content; the failed-run path (`_persistFailed`) keeps the computed rows.

### Implementation for User Story 3

- [X] T019 [US3] Extend `src/domain/services/SustainedTriggerEvaluator.js`: return `insufficient-history` when the condition holds now and there is no prior usable observation; set `historyLimited` when the walk reaches the end of the available observations while still satisfying; set `observations` to the count of usable prior observations considered; make `evaluate` tolerant of `undefined`, `null` and non-array inputs.
- [X] T020 [US3] Run `npx jest tests/unit/domain/services/SustainedTriggerEvaluator.test.js tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.sustainedTriggers.test.js` until green.

**Checkpoint**: all three stories pass independently.

---

## Phase 6: Polish and cross-cutting

- [X] T021 Run the full suite and lint: `npm test` and `npm run lint`; fix anything this feature broke.
- [X] T022 [P] Work through `specs/021-sustained-macro-triggers/quickstart.md` steps 1 to 4 and correct any command or filename in it that does not match what was built.
- [X] T023 [P] Add the `mcp.js` file to the Source Code tree in `specs/021-sustained-macro-triggers/plan.md` (the plan listed only `getWeeklyAnalysis.js`; T004 changes both).
- [X] T024 Confirm privacy: `git diff main --stat` shows no real holdings, prices or account data, and every fixture value is an invented macro number. Stage explicit paths only.

---

## Dependencies and execution order

- Phase 1, then Phase 2. Phase 2 tasks T002 to T006 touch different files and run in parallel.
- US1 (Phase 3) needs Phase 2. Inside it: T007 and T008 (tests) and T012 (guardrail text) are parallel; T009 precedes T010 and T011; T010 and T011 edit the same file, so they run in order; T013 last.
- US2 (Phase 4) needs T009. T014 precedes T015 (tests first), T016 last.
- US3 (Phase 5) needs T009 and T010. T017 and T018 are parallel; T019 edits the evaluator after T015, so run it after Phase 4.
- Phase 6 last.

```text
T001 → T002..T006 [P] → T007,T008,T012 [P] → T009 → T010 → T011 → T013
                                                 ↓
                                  T014 → T015 → T016 → T017,T018 [P] → T019 → T020 → T021..T024
```

## Implementation strategy

- **MVP**: Phase 1, Phase 2 and Phase 3 (US1). That alone lets a sustained breach fire its trigger when readings are always available. It should not ship alone, because without US2 a single outage resets nothing but also cannot be told apart, and the gross-reserves trigger would still evaluate as "not satisfied". Treat US1 + US2 as the shippable unit.
- **Incremental**: US1 → US2 → US3, committing after each phase with `feat:` or `test:` subjects.
- **Commits**: speckit work may be committed as it goes; stage explicit paths, never `git add .` or `-A`.
