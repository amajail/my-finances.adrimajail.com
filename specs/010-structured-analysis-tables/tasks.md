# Tasks: Structured Analysis Tables

**Input**: Design documents from `/specs/010-structured-analysis-tables/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included for backend logic only (Constitution Principle IV — Pragmatic Testing: domain services, entity validation, repository round-trips, and route smoke tests). Frontend Astro rendering is exempt.

**Organization**: Grouped by user story. Priority order from spec.md: US1 (P1) → US2 (P2) → US4 (P2) → US3 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish carry no story label)

## Path note

Pure calculators follow the existing `src/domain/services/` convention
(`PositionChangeCalculator`, `PortfolioCalculator`), so `AllocationDriftCalculator`
lives there — refining plan.md's tentative `src/application/use-cases/analysis/` path.

## ⚠️ Shared-file sequencing (read before parallelizing)

Three files are edited by multiple stories and therefore those tasks are **sequential, not parallel**, even across stories:

- `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` → T014, T019, T023, T029
- `dashboard/src/pages/analysis-detail.astro` → T015, T020, T030
- `src/application/use-cases/analysis/prompts/submit-analysis-tool.json` → T018, T028
- `src/domain/services/AllocationDriftCalculator.js` → T012, T016

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Committed placeholders for the new machine-readable targets artifact (real values stay local — Privacy First).

- [ ] T001 [P] Create committed placeholder `scripts/allocation-targets.example.json` with generic, holdings-free sample data conforming to `specs/010-structured-analysis-tables/contracts/allocation-targets.schema.json` (buckets/classes/targets + a couple of caps using `SYM_A`-style placeholders)
- [ ] T002 [P] Add `scripts/allocation-targets.local.json` to `.gitignore` (the real targets file — never committed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared entity/persistence plumbing for all six structured sections, plus the allocation-targets repository the code-computed stories (US1, US2) depend on.

**⚠️ CRITICAL**: US1, US2, and US3 persistence depend on T003 + T005; US1/US2 computation depends on T007–T011.

- [ ] T003 Add six optional structured fields (`driftByBucket`, `driftByAssetClass`, `concentrationCaps`, `watchlist`, `weekOverWeek`, `frameworkAmendments`) to `src/domain/entities/WeeklyAnalysis.js` — constructor handling, light "absent=ok / present-but-malformed=reject" validation, freeze, and `toJSON`, mirroring the existing `macroContext`/`positionChanges` treatment
- [ ] T004 [P] Unit tests for the six new fields (absent→null, `[]`→empty, valid array→accepted, malformed→ValidationError) in `tests/unit/domain/entities/WeeklyAnalysis.structuredSections.test.js`
- [ ] T005 Add six JSON columns (`driftByBucketJson`, `driftByAssetClassJson`, `concentrationCapsJson`, `watchlistJson`, `weekOverWeekJson`, `frameworkAmendmentsJson`) to `_analysisToEntity`/`_analysisFromEntity` in `src/infrastructure/repositories/AzureAnalysisRepository.js` — write only when non-null, parse with the existing `_parseJsonColumn` helper (absent/malformed→null)
- [ ] T006 [P] Round-trip unit test for the six columns (write→read, absent column→null, malformed→null) in `tests/unit/infrastructure/repositories/AzureAnalysisRepository.test.js`
- [ ] T007 [P] Create `IAllocationTargetsRepository` interface (`getActive(): Promise<targets|null>`) in `src/application/interfaces/IAllocationTargetsRepository.js` and export it from `src/application/interfaces/index.js`
- [ ] T008 Implement `AzureAllocationTargetsRepository` reading the `portfolioSettings` row `analysis.allocationTargetsV1` (parse JSON; return null when absent/malformed, logged) in `src/infrastructure/repositories/AzureAllocationTargetsRepository.js`
- [ ] T009 [P] Unit test `AzureAllocationTargetsRepository` (present→parsed, absent→null, malformed→null) in `tests/unit/infrastructure/repositories/AzureAllocationTargetsRepository.test.js`
- [ ] T010 [P] Create idempotent seeder `scripts/seed-allocation-targets.js` — reads `scripts/allocation-targets.local.json`, skip-if-present on `analysis.allocationTargetsV1` (insert-only, per Principle III), mirroring `scripts/seed-analysis-framework.js`
- [ ] T011 Wire `AzureAllocationTargetsRepository` into the DI container and make it available to `GenerateWeeklyAnalysis` in `src/application/di/container.js`

**Checkpoint**: Entity + persistence + targets infrastructure ready.

---

## Phase 3: User Story 1 - Scan allocation drift at a glance (Priority: P1) 🎯 MVP

**Goal**: Render bucket-drift and asset-class-drift as tables (target %, current %, signed drift), over/under flagged by sign.

**Independent Test**: Seed targets, open a freshly run analysis detail page → "Bucket drift" and "Asset-class drift" tables show with over/under rows distinguished; a pre-feature analysis shows neither table and no errors.

- [ ] T012 [US1] Create pure `AllocationDriftCalculator` in `src/domain/services/AllocationDriftCalculator.js` — membership resolution (symbols → assetTypes(+brokers) → synthetic `unclassified`), per-class & per-bucket current USD and % of grand total, `driftPct = currentPct − targetPct`; returns `driftByBucket[]` + `driftByAssetClass[]` (drift only this task)
- [ ] T013 [P] [US1] Unit tests for drift math, membership precedence, and unclassified reconcile-to-100% in `tests/unit/domain/services/AllocationDriftCalculator.test.js`
- [ ] T014 [US1] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, load targets via the repo, compute `driftByBucket`/`driftByAssetClass` from the existing `portfolioSummary`, attach to the `WeeklyAnalysis`; omit gracefully (null) when targets are absent (Edge: targets unavailable — run must not fail)
- [ ] T015 [US1] Render "Bucket drift" and "Asset-class drift" sections (target/current/signed-drift columns; over-weight vs under-weight distinguished by sign per FR-005) in `dashboard/src/pages/analysis-detail.astro`, shown only when the arrays are present and non-empty

**Checkpoint**: US1 fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Review risk flags and caps as tables (Priority: P2)

**Goal**: Add the code-computed concentration-caps table and the LLM-emitted watchlist table.

**Independent Test**: Open an analysis whose run produced caps and/or watchlist → "Concentration caps" table (entity label, soft/hard limit, current %, breach badge) and "Watchlist" table render; when none, both are omitted.

- [ ] T016 [US2] Extend `AllocationDriftCalculator` (`src/domain/services/AllocationDriftCalculator.js`) with concentration-cap evaluation: per cap entry resolve `scope` (portfolio|bucket) denominator and `match` dimension (symbol/assetType/classKey/bucketKey), compute `currentPct`, set `breach` = highest of none/soft/hard; returns `concentrationCaps[]`
- [ ] T017 [P] [US2] Unit tests for cap breach logic (none/soft/hard, both scopes, each match dimension) in `tests/unit/domain/services/AllocationDriftCalculator.test.js`
- [ ] T018 [US2] Extend the `submit_analysis` tool schema with the optional `watchlist[]` array per `contracts/submit-analysis-additions.md` in `src/application/use-cases/analysis/prompts/submit-analysis-tool.json`
- [ ] T019 [US2] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, compute `concentrationCaps` via the calculator and pass the LLM `watchlist[]` through onto the `WeeklyAnalysis`
- [ ] T020 [US2] Render "Concentration caps" and "Watchlist" sections in `dashboard/src/pages/analysis-detail.astro`, each shown only when present and non-empty

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 4 - Safely edit the analysis instructions (Priority: P2)

**Goal**: Fixed, committed guardrail preamble prepended to the editable body (effective prompt = preamble ⊕ body), shown read-only in the editor with an editing guide; trim the now-tabular sections from the base prompt template.

**Independent Test**: Open `/instructions` → a read-only preamble block and an editing guide are visible above the editable body; the preamble cannot be edited/removed; the next run applies it regardless of body content; `GET /api/instructions` returns `preamble` + `editingGuide`.

- [ ] T021 [P] [US4] Create the committed guardrail preamble `src/application/use-cases/analysis/prompts/guardrail-preamble-v1.md` — generic/holdings-free: use only provided data, never invent figures, treat the supplied drift/cap tables as authoritative and do NOT recompute or restate them, return results only via the analysis tool (FR-015)
- [ ] T022 [P] [US4] Create the committed editing guide `src/application/use-cases/analysis/prompts/editing-guide-v1.md` — what the body controls vs. what the preamble/code own, no inventing figures, no recomputing the tables, output shape enforced by the tool (malformed instructions → clean failed run) (FR-018)
- [ ] T023 [US4] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, prepend the preamble at assembly (`systemPrompt = preamble + "\n\n---\n\n" + instructionsContent`) and update the `promptVersion` marker to record that a preamble was applied (FR-014)
- [ ] T024 [US4] Extend `GetActiveInstructions` (`src/application/use-cases/instructions/GetActiveInstructions.js`) to also return `preamble` + `editingGuide` (read from the committed files) and surface them in the `GET /api/instructions` response in `src/functions/instructions.js` (FR-017); `PUT` remains body-only (FR-016)
- [ ] T025 [P] [US4] Integration test: `GET /api/instructions` returns `preamble` + `editingGuide`, and `PUT /api/instructions` still accepts only `{content, changeNote?}`, in `tests/integration/functions/instructions.test.js`
- [ ] T026 [US4] Editor: render the preamble in a read-only block above the editable textarea and add a collapsible editing-guide panel; keep the textarea bound to the body only (no preamble editing) in `dashboard/src/pages/instructions.astro`
- [ ] T027 [US4] Trim the now-tabular sections (bucket/class weights & drift, concentration call-outs) from the required-markdown Output section of the base prompt template `src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md`, keeping only prose interpretation (FR-009)

**Checkpoint**: Instruction editing is guarded and transparent; narrative no longer restates the tables.

---

## Phase 6: User Story 3 - Week-over-week analytical deltas and framework amendments (Priority: P3)

**Goal**: Capture and render the two remaining LLM-emitted sections.

**Independent Test**: Open an analysis with analytical deltas and/or amendment suggestions → both render as structured rows, visually distinct from the feature-006 position-changes table; absent on first run / when none reported.

- [ ] T028 [US3] Extend the `submit_analysis` tool schema with the optional `weekOverWeek[]` and `frameworkAmendments[]` arrays per `contracts/submit-analysis-additions.md` in `src/application/use-cases/analysis/prompts/submit-analysis-tool.json`
- [ ] T029 [US3] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`, pass the LLM `weekOverWeek[]` + `frameworkAmendments[]` through onto the `WeeklyAnalysis`
- [ ] T030 [US3] Render "Week-over-week" (analytical) and "Framework amendments" sections in `dashboard/src/pages/analysis-detail.astro` — the week-over-week section labeled distinctly from the existing position-changes table (FR-012), each shown only when present and non-empty

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T031 [P] Run the full Jest suite (`npm test`) and the dashboard build (`cd dashboard && npm run build`); fix any failures (no red on `main`, per Principle IV)
- [ ] T032 Run `specs/010-structured-analysis-tables/quickstart.md` end-to-end: seed targets → run analysis → verify all six tables + read-only preamble + editing guide → confirm pre-feature analysis and targets-absent degradation (SC-004, Edge cases)
- [ ] T033 [P] Privacy self-review of the diff before any push: confirm `allocation-targets.local.json` is untracked and no real symbols/quantities/PPCs/caps appear in committed files (Principle I)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup. T003+T005 block all persistence; T007–T011 block US1/US2 computation.
- **US1 (Phase 3)**: after Foundational. MVP.
- **US2 (Phase 4)**: after US1 (extends `AllocationDriftCalculator` from T012; edits the same `GenerateWeeklyAnalysis`/`analysis-detail.astro`).
- **US4 (Phase 5)**: after Foundational; independent of US1/US2 data, but T023 edits `GenerateWeeklyAnalysis` (sequence after T019).
- **US3 (Phase 6)**: after Foundational; edits shared tool schema (after T018) + `GenerateWeeklyAnalysis` (after T023) + `analysis-detail.astro` (after T020).
- **Polish (Phase 7)**: after all desired stories.

### Story independence

Each story degrades gracefully and is independently demoable: shipping only US1 yields a working drift view; US2/US3/US4 each add value without breaking earlier stories (all new fields are optional/null on absence).

### Within each story

- Tests for domain logic alongside the calculator/entity/repo task.
- Models/entities → services → use-case wiring → endpoint/UI.

---

## Parallel opportunities

- **Setup**: T001, T002 in parallel.
- **Foundational**: T004, T006, T007, T009, T010 are [P] (distinct files); T003 precedes T004, T005 precedes T006, T008 precedes T009.
- **US1**: T013 (tests) parallel to other [P] work once T012 lands.
- **US4**: T021, T022 (two new committed files) and T025 (test) in parallel.
- **Cross-story parallelism is limited** by the shared files listed at the top — coordinate edits to `GenerateWeeklyAnalysis.js`, `analysis-detail.astro`, and `submit-analysis-tool.json`.

### Parallel example: Foundational

```bash
# After T003 and T005 land, these touch distinct files:
Task: "T007 IAllocationTargetsRepository interface"
Task: "T009 AzureAllocationTargetsRepository unit test"
Task: "T010 seed-allocation-targets.js"
Task: "T004 WeeklyAnalysis structured-sections tests"
Task: "T006 AzureAnalysisRepository round-trip test"
```

---

## Implementation strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate** the drift tables → demo. This alone delivers the largest readability win (SC-001).

### Incremental delivery

US1 (drift) → US2 (caps + watchlist) → US4 (instruction guardrails + narrative trim) → US3 (analytical deltas + amendments). Each is a shippable increment; the guardrail (US4) is sequenced before US3 so the trimmed narrative and "don't recompute tables" invariant are in force once all tables exist.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Commit after each task or logical group (speckit work → commits authorized).
- No new runtime dependencies; no new Azure tables (new settings row + new JSON columns only).
- Privacy: real targets live only in `analysis.allocationTargetsV1` / `scripts/allocation-targets.local.json`; only the placeholder example is committed.
