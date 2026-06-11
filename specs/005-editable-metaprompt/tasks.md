---
description: "Task list for Editable Analysis Metaprompt (005)"
---

# Tasks: Editable Analysis Metaprompt

**Input**: Design documents from `/specs/005-editable-metaprompt/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included. The constitution (Principle IV — Pragmatic Testing) mandates
tests for domain entities, use-cases, and HTTP route smoke tests, and feature 004
established this coverage. Tests are written alongside each story (not strict
TDD-first ordering).

**Organization**: Tasks grouped by user story (US1 = P1, US2 = P2, US3 = P3) for
independent implementation and testing.

**Approach**: This feature refactors/renames feature 004's "Framework" surface to
"Instructions". Many tasks are close copies of an existing 004 file with renamed
identifiers, a new table/settings key, and the larger 256 KB cap — referenced
inline so each task is self-contained.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish have no story label)

## Path Conventions

Web app: backend at `src/`, frontend at `dashboard/`, tests at `tests/` (repo root).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding for the new Instructions module.

- [ ] T001 Create the use-case directory `src/application/use-cases/instructions/` (will hold the 5 instructions use-cases). Branch `005-editable-metaprompt` and dependencies already exist — no install needed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain entity, repository, storage, and seed that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Create `InstructionsHistoryEntry` domain entity in `src/domain/entities/InstructionsHistoryEntry.js` — mirror `src/domain/entities/FrameworkHistoryEntry.js` but set `static MAX_BYTES = 262144` (256 KB), validate non-empty-after-trim `content`, UTF-8 byte cap, `source` ∈ {edit,restore} with consistent `restoreOfRowKey`, `changeNote` ≤ 280 chars→null, keep `static buildRowKey(epochMs)`. Frozen/immutable. (FR-005, FR-006, FR-009; data-model.md)
- [ ] T003 [P] Create repository interface `src/application/interfaces/IInstructionsRepository.js` — mirror `IFrameworkRepository.js`: `getActive()`, `saveActive({content, changeNote, source, restoreOfRowKey})`, `listHistory({limit})`, `getHistoryEntry(rowKey)`.
- [ ] T004 Create `src/infrastructure/repositories/AzureInstructionsRepository.js` — mirror `AzureFrameworkRepository.js` but use table `portfolioInstructionsHistory` (PartitionKey `'instructions'`), active settings row `analysis.instructionsV1`, and `InstructionsHistoryEntry`. Two-phase write: append history `createEntity`, then `upsertEntity('Merge')` the settings row with `value`/`historyRowKey`/`updatedAt`. Depends on T002, T003. (data-model.md storage layer)
- [ ] T005 Create the `portfolioInstructionsHistory` table in `src/database/AzureTableDatabase.js` `initialize()` alongside the existing tables. Leave 004's `portfolioFrameworkHistory` creation in place (non-destructive). 
- [ ] T006 Wire the new repository into the barrels and DI container: export `IInstructionsRepository` from `src/application/interfaces/index.js`, `AzureInstructionsRepository` from `src/infrastructure/repositories/index.js`, and instantiate `instructionsRepository` in `src/application/di/container.js`. Depends on T003, T004.
- [ ] T007 Create seed script `scripts/seed-instructions-from-framework.js` — read the committed base template `src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md`, read live `analysis.strategicFrameworkV1` from settings, produce `template.replace(/\{\{strategicFramework\}\}/g, framework.trim())` (replace ONLY that token; leave other `{{...}}` literal), write exactly ONE `InstructionsHistoryEntry` + set the `analysis.instructionsV1` active row. Idempotent: skip-if-present (no second seed, no overwrite). **Fresh/unseeded environment** (no `analysis.strategicFrameworkV1` present): substitute the placeholder with the generic `scripts/seed-analysis-framework.example.md` content (or a clearly-marked "configure your instructions" stub) so a clean deploy still produces a valid one-version seed rather than emitting a literal `{{strategicFramework}}` line (relates to FR-014). Privacy: reads framework at runtime only — never embeds real values in git. Depends on T002, T004. (FR-015, FR-020, SC-004; research.md R2)
- [ ] T008 [P] Unit test `tests/unit/domain/entities/InstructionsHistoryEntry.test.js` — mirror `FrameworkHistoryEntry.test.js`: valid edit/restore entries, 256 KB cap rejection, empty rejection, source/restoreOfRowKey consistency, changeNote length. Depends on T002.

**Checkpoint**: Entity, repository, storage table, and seed exist — user stories can begin.

---

## Phase 3: User Story 1 - Edit the complete analysis instructions (Priority: P1) 🎯 MVP

**Goal**: Owner edits the entire instructions document as one free-form text and saves it; the next weekly analysis uses it verbatim as the system prompt.

**Independent Test**: Open `/instructions`, confirm it shows the FULL document (fixed sections + former framework), change a previously developer-only line, save, trigger an analysis, and confirm the AI received the saved text verbatim.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create `GetActiveInstructions` use-case in `src/application/use-cases/instructions/GetActiveInstructions.js` — mirror `GetActiveFramework.js`; return `{content, historyRowKey, updatedAt, maxBytes: 262144}`. (contracts/api.md §1)
- [ ] T010 [P] [US1] Create `SaveInstructions` use-case in `src/application/use-cases/instructions/SaveInstructions.js` — mirror `SaveFramework.js`: reject empty/whitespace (FR-005), enforce 256 KB (FR-006) with message stating limit + actual size, no-op detection vs active normalized content (FR-007), append history + update active. Return `{historyRowKey, timestamp, noop}`. (contracts/api.md §2)
- [ ] T011 [US1] Register `GetActiveInstructions` + `SaveInstructions` in `src/application/use-cases/index.js` and wire into `src/application/di/container.js`. Depends on T009, T010.
- [ ] T012 [US1] Create `src/functions/instructions.js` with `GET /api/instructions` (getInstructions) and `PUT /api/instructions` (updateInstructions), `authLevel: 'function'` — mirror the GET/PUT handlers in `framework.js`, wired to the new use-cases. Depends on T009, T010, T011. (contracts/api.md §1–2, FR-016)
- [ ] T013 [US1] Edit `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`: read the active instructions document from `instructionsRepository.getActive()` and use `content` **verbatim** as the system prompt. Remove `_loadPrompt`/`_renderSystemPrompt` template-file loading, the `analysis.promptVersion` read, and the `{{strategicFramework}}` substitution (FR-003, FR-004, FR-019). Keep the user-message assembly (portfolio/previous/riesgoPais) unchanged. If no active document, fail clearly with "instructions not configured" (FR-014). Depends on T004, T006.
- [ ] T013a [US1] Inject `instructionsRepository` into the `GenerateWeeklyAnalysis` construction at every wiring site — `src/application/di/container.js` and, if it constructs the use-case directly, `src/functions/weeklyAnalysisTimer.js` — replacing the optional `frameworkRepository` dependency that 004 wired there. Confirm the analysis runtime path actually receives the new repo. Depends on T006, T013.
- [ ] T014 [P] [US1] Create dashboard page `dashboard/src/pages/instructions.astro` — mirror `framework.astro`: Edit/Preview tabs, byte counter against 262144 with red over-cap state, changeNote input (≤280), save with confirmation + last-saved timestamp, empty-state when 404. Labels say **Instructions**. (FR-001, FR-002, FR-017, FR-018)
- [ ] T015 [P] [US1] Edit dashboard nav in `dashboard/src/layouts/Layout.astro`: replace the `{ id:'framework', label:'Framework', href:'/framework' }` entry with `{ id:'instructions', label:'Instructions', href:'/instructions' }` (SC-006, FR-018).
- [ ] T016 [P] [US1] Add `getInstructions()` and `saveInstructions(content, changeNote)` client functions in `dashboard/src/lib/api.js` calling `/instructions` (GET/PUT).
- [ ] T017 [P] [US1] Unit test `tests/unit/application/use-cases/instructions/SaveInstructions.test.js` — mirror `SaveFramework.test.js`: no-op (FR-007), empty rejection (FR-005), 256 KB cap (FR-006), persistence + source wiring.
- [ ] T018 [US1] Update `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js` — assert the system prompt equals the active instructions content verbatim (no `{{strategicFramework}}` substitution, no template-file load) and that an unconfigured document yields the "instructions not configured" failure. Depends on T013.
- [ ] T019 [US1] Create `tests/integration/functions/instructions.test.js` covering `GET /api/instructions` and `PUT /api/instructions` response shapes (200, no-op, 400 empty, 400 oversize) against contracts/api.md. (History/restore cases added in US2.)

**Checkpoint**: Owner can edit/save the full document; analysis uses it verbatim. MVP complete.

---

## Phase 4: User Story 2 - Review and restore previous versions (Priority: P2)

**Goal**: Owner views append-only history newest-first, opens any version read-only, and restores any past version (which appends a new restore entry).

**Independent Test**: Save two versions, open history, expand an older entry, restore it, confirm active matches and a new restore entry was appended.

### Implementation for User Story 2

- [ ] T020 [P] [US2] Create `ListInstructionsHistory` use-case in `src/application/use-cases/instructions/ListInstructionsHistory.js` — mirror `ListFrameworkHistory.js`: validate `limit` ∈ [1,200] default 50, return `{entries:[{rowKey,timestamp,changeNote,source,restoreOfRowKey,contentBytes}], count}` newest-first, empty-state `count:0`. (contracts/api.md §3, FR-010)
- [ ] T021 [P] [US2] Create `GetInstructionsHistoryEntry` use-case in `src/application/use-cases/instructions/GetInstructionsHistoryEntry.js` — mirror `GetFrameworkHistoryEntry.js`: return full content of one entry or not-found. (contracts/api.md §4, FR-010)
- [ ] T022 [US2] Create `RestoreInstructionsVersion` use-case in `src/application/use-cases/instructions/RestoreInstructionsVersion.js` — mirror `RestoreFrameworkVersion.js`: fetch target, delegate to `SaveInstructions` with `source:'restore'` + `restoreOfRowKey`, auto-generate `"Restored from <ISO>"` note when omitted, honor no-op (FR-011). Depends on T010, T021.
- [ ] T023 [US2] Register `ListInstructionsHistory`, `GetInstructionsHistoryEntry`, `RestoreInstructionsVersion` in `src/application/use-cases/index.js` and `src/application/di/container.js`. Depends on T020, T021, T022.
- [ ] T024 [US2] Add to `src/functions/instructions.js`: `GET /api/instructions/history` (listInstructionsHistory), `GET /api/instructions/history/{rowKey}` (getInstructionsHistoryEntry), `POST /api/instructions/history/{rowKey}/restore` (restoreInstructionsVersion), `authLevel: 'function'`. Depends on T020, T021, T022. (contracts/api.md §3–5)
- [ ] T025 [P] [US2] Add the history section to `dashboard/src/pages/instructions.astro` — mirror framework.astro: list newest-first with timestamp/changeNote/source tag, expand to read-only full content, Restore button + confirm modal, hash deep-link `#<rowKey>` auto-expand, empty-state. (FR-010, FR-011)
- [ ] T026 [P] [US2] Add `listInstructionsHistory(limit)`, `getInstructionsHistoryEntry(rowKey)`, `restoreInstructionsVersion(rowKey, changeNote)` to `dashboard/src/lib/api.js`.
- [ ] T027 [P] [US2] Unit test `tests/unit/application/use-cases/instructions/ListInstructionsHistory.test.js` — mirror `ListFrameworkHistory.test.js` (limit bounds, newest-first, empty-state).
- [ ] T028 [P] [US2] Unit test `tests/unit/application/use-cases/instructions/RestoreInstructionsVersion.test.js` — mirror `RestoreFrameworkVersion.test.js` (restore appends entry, no-op, auto-note, not-found).
- [ ] T029 [US2] Extend `tests/integration/functions/instructions.test.js` with the history list, single-entry, and restore endpoints (200/404/400) per contracts/api.md. Depends on T024.

**Checkpoint**: Full history + restore working; US1 + US2 independently functional.

---

## Phase 5: User Story 3 - Trace which instructions produced an analysis (Priority: P3)

**Goal**: Each analysis records the instructions version active when it ran; the owner can navigate to that version. Pre-feature analyses handled gracefully.

**Independent Test**: Generate an analysis, change instructions, open the earlier analysis, confirm it references/links the version active at run time (not current).

### Implementation for User Story 3

- [ ] T030 [US3] Add optional `instructionsHistoryRowKey` to `src/domain/entities/WeeklyAnalysis.js` (additive, defaults `null`); keep the legacy `frameworkHistoryRowKey` property for old rows. (data-model.md, R5)
- [ ] T031 [US3] Update `src/infrastructure/repositories/AzureAnalysisRepository.js` to persist `instructionsHistoryRowKey` and default it to `null` when absent on read (schema-on-write); keep reading legacy `frameworkHistoryRowKey`. Depends on T030. (FR-013)
- [ ] T032 [US3] Update `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` to capture `historyRowKey` from the single `getActive()` call at run start (snapshot-at-start) and stamp it as `instructionsHistoryRowKey` on every `WeeklyAnalysis` it writes, including failure paths. Depends on T013, T030. (FR-012)
- [ ] T033 [US3] Return `instructionsHistoryRowKey` in `src/functions/getWeeklyAnalysis.js` (detail) and `src/functions/getWeeklyAnalysisList.js` (list); continue returning legacy `frameworkHistoryRowKey` for old rows. Depends on T031. (contracts/api.md existing-endpoint impact)
- [ ] T034 [P] [US3] Update `dashboard/src/pages/analysis-detail.astro`: read `instructionsHistoryRowKey`, render an "Instructions version: <id>" badge linking to `/instructions#<rowKey>`; fall back to legacy framework reference or "(pre-history seed)" when absent. (FR-013)
- [ ] T034a [P] [US3] Update the analysis **list** page `dashboard/src/pages/analysis.astro` to render the same per-item "Instructions: <id>" badge from `instructionsHistoryRowKey` (mirrors 004's list badge; contracts/api.md `GET /api/analysis/weekly` impact), with the same legacy/pre-seed fallback. (FR-013)
- [ ] T035 [P] [US3] Repurpose `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.frameworkLink.test.js` → assert `instructionsHistoryRowKey` snapshot-at-start (mid-run save does not change the in-flight run). Depends on T032.
- [ ] T036 [US3] Update `tests/integration/functions/getWeeklyAnalysis.test.js` to assert `instructionsHistoryRowKey` propagates in the response (and pre-feature rows return null gracefully). Depends on T033.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Remove the superseded 004 "Framework" surface (SC-006) and validate end to end.

- [ ] T037 Delete the framework backend and unwire it: `src/functions/framework.js`, `src/infrastructure/repositories/AzureFrameworkRepository.js`, `src/application/interfaces/IFrameworkRepository.js`, `src/application/use-cases/framework/` (all 5), `src/domain/entities/FrameworkHistoryEntry.js`, and remove their entries from `src/application/interfaces/index.js`, `src/infrastructure/repositories/index.js`, `src/application/use-cases/index.js`, `src/application/di/container.js`. Leave the `portfolioFrameworkHistory` table + `analysis.strategicFrameworkV1` row in storage (non-destructive). Depends on T013, T032 (no remaining references).
- [ ] T038 [P] Delete the framework frontend: `dashboard/src/pages/framework.astro` and any leftover framework API functions in `dashboard/src/lib/api.js`. Verify no nav/link references `/framework`.
- [ ] T039 [P] Remove the superseded framework tests: `tests/integration/functions/framework.test.js`, `tests/unit/domain/entities/FrameworkHistoryEntry.test.js`, `tests/unit/application/use-cases/framework/`.
- [ ] T040 Confirm `analysis.promptVersion` and `prompts/${version}.md` are no longer read anywhere at runtime (`grep -r promptVersion src/`); keep `weekly-rebalance-v1.md` as the committed seed source only and add a header comment noting it is no longer loaded at runtime. (FR-019)
- [ ] T041 [P] Run the full Jest suite and `dashboard` build; fix any red (Constitution IV — no red on main).
- [ ] T042 Execute `specs/005-editable-metaprompt/quickstart.md` end-to-end: seed, byte-for-byte check (SC-004), edit/save, size + empty + no-op rejections, history, restore, snapshot-at-start traceability, and "no instructions configured" failure.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational. US1 is the MVP; US2 and US3 build on it.
- **Polish (Phase 6)**: Depends on US1 + US3 being complete (removes the old code path only after the new one is live).

### User Story Dependencies

- **US1 (P1)**: After Foundational. Independently testable. (Touches `GenerateWeeklyAnalysis.js` first.)
- **US2 (P2)**: After Foundational. `RestoreInstructionsVersion` reuses `SaveInstructions` (T010 from US1) — do US1 first or stub. UI/history independently testable.
- **US3 (P3)**: After US1 (shares `GenerateWeeklyAnalysis.js` — T032 follows T013) and Foundational. Independently testable for traceability.

### Within Each User Story

- Use-cases before their DI registration before HTTP handlers.
- Backend before the dashboard wiring.
- Tests alongside (verify before moving on).

### Parallel Opportunities

- Foundational: T003 [P] and T008 [P] alongside the entity/repo chain.
- US1: T009/T010 [P] (separate use-case files); T014/T015/T016 [P] (separate dashboard files); T017 [P].
- US2: T020/T021 [P]; T025/T026 [P]; T027/T028 [P].
- US3: T034 [P]; T035 [P].
- Polish: T038/T039/T041 [P].
- **Cross-file caution**: T013 and T032 both edit `GenerateWeeklyAnalysis.js` — sequential, not parallel. T012 and T024 both edit `instructions.js` — sequential. T014 and T025 both edit `instructions.astro` — sequential.

---

## Parallel Example: User Story 1

```bash
# Use-cases (separate files):
Task: "Create GetActiveInstructions use-case in src/application/use-cases/instructions/GetActiveInstructions.js"
Task: "Create SaveInstructions use-case in src/application/use-cases/instructions/SaveInstructions.js"

# Dashboard (separate files), after backend lands:
Task: "Create dashboard/src/pages/instructions.astro"
Task: "Edit dashboard/src/layouts/Layout.astro nav entry"
Task: "Add instructions client fns to dashboard/src/lib/api.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (Setup) → Phase 2 (Foundational, incl. seed) → Phase 3 (US1).
2. **STOP and VALIDATE**: edit/save the full document; trigger an analysis; confirm verbatim use and byte-for-byte seed equivalence (SC-004).
3. Deploy/demo — the owner can now edit the whole metaprompt.

### Incremental Delivery

1. Foundational ready → US1 (MVP) → US2 (history/restore) → US3 (traceability).
2. Polish removes the old Framework surface once Instructions is fully live.
3. Each story adds value without breaking the previous.

---

## Notes

- [P] = different files, no incomplete dependencies. [Story] maps each task to US1/US2/US3.
- This feature is largely a rename-and-extend of 004 — diff against the named 004 file for each "mirror" task, then apply the new table/key and 256 KB cap.
- **Privacy (NON-NEGOTIABLE)**: never commit the seeded merged document (it contains the real framework). Tests/fixtures use clearly-fake instructions. Scan diffs before staging anything under `scripts/`.
- Old framework storage (`portfolioFrameworkHistory`, `analysis.strategicFrameworkV1`) is left intact — removal is code-only.
- Commit after each task or logical group; conventional messages (`feat:`, `refactor:`, `test:`).
