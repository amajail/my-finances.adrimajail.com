---
description: "Task list for Weekly Context Capture"
---

# Tasks: Weekly Context Capture (Macro Metrics + Portfolio Totals + Position Changes)

**Input**: Design documents from `/specs/006-weekly-context-capture/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — Constitution IV (Pragmatic Testing) requires tests for domain entities,
use-cases, and providers. All fixtures MUST use clearly-fake holdings data (Constitution I).

**Organization**: Tasks grouped by user story. Note: one use-case (`GenerateWeeklyAnalysis.js`)
and two presentation files (`getWeeklyAnalysis.js`, `analysis-detail.astro`) are edited by
multiple stories; those edits are serialized (not `[P]` across stories), but each story remains
**independently testable** because the entity/repository scaffolding (Phase 2) carries all three
new fields as optional from the start.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish have no story label)

## Path Conventions

Backend: `src/` at repo root. Dashboard: `dashboard/src/`. Tests: `tests/unit/`, `tests/integration/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Light project prep — directories and config documentation only.

- [x] T001 [P] Document new optional analysis settings keys (`analysis.fredApiKey`, `analysis.imfModel`, `analysis.imfStalenessWeeks`) in `dashboard/src/pages/settings.astro` (documentation only — secrets supplied via Function App Application Settings / gitignored `local.settings.json`, never committed)
- [x] T002 [P] Create the `src/domain/services/` directory (home for the new pure diff service) and copy the IMF classification tool schema from `specs/006-weekly-context-capture/contracts/imf-classify-tool.json` into a runtime module `src/infrastructure/llm/imfClassifyTool.js` (exports the schema object)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the shared entity + repository so EVERY story can persist its artifact. All
three new fields are OPTIONAL (default `null`) so any one story can light up independently.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Extend `WeeklyAnalysis` entity in `src/domain/entities/WeeklyAnalysis.js`: add optional `macroContext`, `portfolioTotals`, `positionChanges` fields (constructor, validation per data-model.md, getters, `toJSON`, `fromJSON`). `positionChanges` must preserve the `null` (unknown) vs `[]` (no change) distinction. All three valid when absent.
- [x] T004 [P] Unit tests for the new entity fields in `tests/unit/domain/entities/WeeklyAnalysis.test.js`: present/absent each field, `positionChanges` null-vs-`[]`, validation rejects malformed shapes, round-trip through `toJSON`/`fromJSON`
- [x] T005 Extend `AzureAnalysisRepository` in `src/infrastructure/repositories/AzureAnalysisRepository.js`: serialize `macroContextJson`, `portfolioTotalsJson`, `positionChangesJson` (stringify, including literal `null` for unknown positionChanges); deserialize with try/catch → `null`; missing column → `null` (pre-feature rows) (depends on T003)
- [x] T006 [P] Integration test in `tests/integration/AzureAnalysisRepository.test.js`: upsert→getByDate round-trip of all three fields, including `positionChanges === null` vs `=== []`, and a pre-feature row (columns absent) reading back as `null`

**Checkpoint**: Entity + storage carry the three artifacts. User stories can now proceed.

---

## Phase 3: User Story 1 - Macro context captured, used, and shown (Priority: P1) 🎯 MVP

**Goal**: Gather the 9-indicator macro panel each run, inject it into the AI user message, persist
it immutably, and render it on the detail page — with every source individually resilient
(riesgo país becomes non-fatal).

**Independent Test**: Trigger a run; the stored record + detail API contain all 9 indicators
(value+asOf or `available:false`); take one source offline → run still completes with that
indicator unavailable and the rest populated; detail page shows the grouped panel.

### Providers (all parallel — independent files)

- [x] T007 [P] [US1] `IFxGapProvider` (`src/application/interfaces/IFxGapProvider.js`) + `DolarApiFxGapProvider` (`src/infrastructure/providers/DolarApiFxGapProvider.js`): fetch `/v1/dolares/oficial` + `/bolsa`, return `{ gapPct, asOf }`, throw `FxGapFetchError` on failure
- [x] T008 [P] [US1] Unit test `tests/unit/infrastructure/providers/DolarApiFxGapProvider.test.js` (mocked fetcher; gap math; error branches)
- [x] T009 [P] [US1] `IBcraMonetariasProvider` + `BcraMonetariasProvider` (`src/infrastructure/providers/BcraMonetariasProvider.js`): `getVariable(idVariable)` against BCRA **v4.0** `/estadisticas/v4.0/Monetarias/{id}`, parse `results[0].detalle[0]` (newest) → `{ value, asOf }`, throw `BcraFetchError`
- [x] T010 [P] [US1] Unit test `tests/unit/infrastructure/providers/BcraMonetariasProvider.test.js` (reserves id 1, policy rate id 160, nested `detalle` shape, error branches)
- [x] T011 [P] [US1] `IInflationProvider` + `ArgentinaDatosInflationProvider` (`src/infrastructure/providers/ArgentinaDatosInflationProvider.js`): `/v1/finanzas/indices/inflacion` latest month → `{ percent, asOf }`, throw `InflationFetchError`
- [x] T012 [P] [US1] Unit test `tests/unit/infrastructure/providers/ArgentinaDatosInflationProvider.test.js`
- [x] T013 [P] [US1] `IFredProvider` + `FredProvider` (`src/infrastructure/providers/FredProvider.js`): `getLatestObservation(seriesId, { units })` against FRED `observations` (`sort_order=desc&limit=1`), parse string `value` (`"."`→missing); read key from `analysis.fredApiKey`; throw `FredConfigError` if key missing, `FredFetchError` on HTTP failure
- [x] T014 [P] [US1] Unit test `tests/unit/infrastructure/providers/FredProvider.test.js` (CPIAUCSL units=pc1, DFEDTARU, missing key → `FredConfigError`, `"."` value handling)
- [x] T015 [P] [US1] `ISp500DrawdownProvider` + `StooqSp500Provider` (`src/infrastructure/providers/StooqSp500Provider.js`): fetch Stooq `^spx` daily CSV, line-split parse, `drawdown = (lastClose − max(Close))/max(Close)×100` (≤0) → `{ drawdownPct, asOf }`, throw `Sp500FetchError`
- [x] T016 [P] [US1] Unit test `tests/unit/infrastructure/providers/StooqSp500Provider.test.js` (CSV fixture; true-ATH drawdown; malformed CSV)
- [x] T017 [P] [US1] Add `classify({ systemPrompt, userMessage, toolSchema, model, maxOutputTokens })` to `src/infrastructure/llm/AnthropicLLMClient.js`: mirror `submitAnalysis` tool_use + schema validation + `LLMLogSanitizer` + cost-from-MODEL_RATES; return `{ result, usage }`
- [x] T018 [P] [US1] Unit test `tests/unit/infrastructure/llm/AnthropicLLMClient.classify.test.js` (mock SDK; forced tool; usage/cost; sanitized error path)
- [x] T019 [US1] `IImfStatusProvider` + `ImfStatusProvider` (`src/infrastructure/providers/ImfStatusProvider.js`): fetch IMF RSS, filter items containing "argentina" in last ~7 days; if matches → `llmClient.classify(...)` with `imfClassifyTool`; else carry forward `priorReading` unless older than `imfStalenessWeeks` (→ `unknown`); return `{ status, asOf, usage }`; failure with no prior → throw `ImfStatusFetchError` (depends on T017)
- [x] T020 [P] [US1] Unit test `tests/unit/infrastructure/providers/ImfStatusProvider.test.js` (matches→classify; no-news→carry-forward; stale>8wk→unknown; fetch fail+no prior→error; verifies only public news text sent to classify)
- [x] T021 [US1] `IMacroContextProvider` + `MacroContextProvider` orchestrator (`src/infrastructure/providers/MacroContextProvider.js`): `Promise.allSettled` over all sources (reuse existing `IRiesgoPaisProvider`), map each to `MacroReading {value, asOf, available, basis?}` (reserves `basis:"gross"`), aggregate IMF `usage`, never throw (depends on T007, T009, T011, T013, T015, T019)
- [x] T022 [P] [US1] Unit test `tests/unit/infrastructure/providers/MacroContextProvider.test.js` (one source rejects → that reading `available:false`, others populate; riesgo país failure non-fatal; usage aggregated) — covers SC-002
- [x] T023 [US1] Wire new providers + `MacroContextProvider` into `src/application/di/container.js` (singleton getters following the existing provider pattern) and inject the orchestrator into `getGenerateWeeklyAnalysis()` (depends on T021)

### Use-case + presentation

- [x] T024 [US1] `GenerateWeeklyAnalysis` (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`): replace the single riesgo-país fetch with `macroContextProvider.getLatest({ priorImfReading })`; riesgo país is now non-fatal; persist `macroContext`; mirror `riesgoPaisBp`/`riesgoPaisAsOf` from `macroContext.riesgoPais`; add IMF `usage` to `tokensIn/tokensOut/costUsd` and the cost-cap accounting; replace the `## riesgoPais` user-message block with `## macroContext`; persist macroContext on `_persistFailed` too (depends on T023)
- [x] T025 [US1] `src/functions/getWeeklyAnalysis.js`: include `macroContext` in the detail response (per contracts/api.md)
- [x] T026 [US1] `dashboard/src/pages/analysis-detail.astro`: add a "Macro Context" block grouped Argentina / US / Global; each reading shows value+unit+as-of; `available:false` greyed out; reserves shows `(gross)`; tolerate absence on pre-feature rows
- [x] T027 [P] [US1] Update `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js`: macro orchestrator mocked; assert macroContext persisted + riesgoPais mirrored + IMF usage folded into telemetry; **riesgo país down → run still completes** (SC-002)

**Checkpoint**: US1 fully functional — macro panel captured, injected, stored, displayed, resilient. **This is the MVP.**

---

## Phase 4: User Story 2 - Portfolio totals preserved per week (Priority: P2)

**Goal**: Persist the run-time portfolio aggregates (USD/ARS totals, unrealized P&L, cost basis,
MEP rate) on every analysis — including failed runs that loaded the summary — and render them.

**Independent Test**: Run an analysis; detail API + page show totals matching the run-time
summary; force the AI step to fail after the summary loads → totals still persisted.

- [x] T028 [US2] `GenerateWeeklyAnalysis.js`: build `portfolioTotals` from the `GetPortfolioSummary` output (`totalByCurrency` USD/ARS, `grandTotalUsd`, `unrealizedPnlByCurrency`, `costBasisByCurrency`, `mepRate`, `mepRateAsOf`); persist on success AND inside `_persistFailed` (FR-014) (serializes after T024 — same file)
- [x] T029 [US2] `src/functions/getWeeklyAnalysis.js`: include `portfolioTotals` in the detail response (after T025 — same file)
- [x] T030 [US2] `dashboard/src/pages/analysis-detail.astro`: add a "Portfolio Totals" block (USD/ARS totals, unrealized P&L both currencies, MEP rate + as-of); tolerate absence (after T026 — same file)
- [x] T031 [P] [US2] Unit test in `GenerateWeeklyAnalysis.test.js`: totals captured correctly from summary; totals preserved when the LLM step throws (FR-014 / SC-004)

**Checkpoint**: US1 + US2 work independently.

---

## Phase 5: User Story 3 - Position changes for the week, computed exactly (Priority: P2)

**Goal**: Compute exact add/remove/increase/reduce vs the previous analysis snapshot, persist
(null vs []), inject into the AI message, and render.

**Independent Test**: With a prior analysis present, edit one holding's quantity, re-run → the
change list contains exactly that position (correct before/after/delta) and nothing from
price-only moves; first run → `null`.

- [x] T032 [P] [US3] `PositionChangeCalculator` pure domain service (`src/domain/services/PositionChangeCalculator.js`): `diff(prior, current)` matching on `broker+assetType+symbol`; classify by quantity delta (`|delta|<1e-9` skipped); `added`/`removed`/`increased`/`reduced` with before/after/delta; return `null` when `prior` is null
- [x] T033 [P] [US3] Unit test `tests/unit/domain/services/PositionChangeCalculator.test.js`: each change type; price-only change → `[]`; first run (prior null) → `null`; identity matching; epsilon (covers SC-005)
- [x] T034 [US3] `GenerateWeeklyAnalysis.js`: extract the prior analysis's `portfolioSnapshot` (nearest prior with a snapshot, per `_loadPreviousAnalysis`), compute `positionChanges` via the calculator, persist (null vs []) on success **and inside `_persistFailed`** (FR-014 — changes are computed before the AI step), add a `## positionChanges` user-message block (serializes after T028 — same file)
- [x] T035 [US3] `src/functions/getWeeklyAnalysis.js`: include `positionChanges` in the detail response (after T029 — same file)
- [x] T036 [US3] `dashboard/src/pages/analysis-detail.astro`: add a "Changes this week" block (badge per change type, qty before → after); show "no changes" for `[]` and "not available" for `null` (after T030 — same file)
- [x] T037 [P] [US3] Unit test in `GenerateWeeklyAnalysis.test.js`: prior snapshot present → changes computed + injected; no prior → `positionChanges === null`; **AI-step failure → computed `positionChanges` still persisted on the failed record (FR-014)**

**Checkpoint**: US1 + US2 + US3 work independently.

---

## Phase 6: User Story 4 - Trend-aware analysis (Priority: P3)

**Goal**: Feed the previous week's macro panel into the prompt so the narrative reasons about
direction, tolerating pre-feature prior analyses that lack macro data.

**Independent Test**: With two consecutive analyses, the second run's AI inputs include the prior
macro panel; a pre-feature prior (no macro) is handled without error.

- [x] T038 [US4] `GenerateWeeklyAnalysis.js`: include the prior week's `macroContext` inside the `## previousAnalysis` block (and pass its `imfReviewStatus` as `priorImfReading` to the orchestrator); when the prior predates this feature, state macro context unavailable (serializes after T034 — same file)
- [x] T039 [P] [US4] Unit test in `GenerateWeeklyAnalysis.test.js`: prior macro included when present; pre-feature prior tolerated; `priorImfReading` threaded to the orchestrator

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T040 [P] Realign existing analysis tests/fixtures to the new orchestrator dependency (`GenerateWeeklyAnalysis.instructionsLink.test.js` and shared mocks) — ensure all use clearly-fake holdings (Constitution I)
- [x] T041 [P] Privacy scan of the whole diff: no real symbols+quantities+PPCs, no secrets, FRED key only via App Settings; placeholder values in any committed fixtures/docs (Constitution I)
- [x] T042 [P] Add a suggested "macro signal weighting" snippet to `specs/006-weekly-context-capture/quickstart.md` (or a short doc) for the owner to paste into the editable instructions document (feature 005) — guidance stays owner-controlled
- [x] T043 Run `quickstart.md` end-to-end locally and verify SC-001…SC-006 (all 9 indicators present; zero runs fail on a source outage; totals + changes visible; exact diff; narrative references macro)

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** / **US3 (P5)** → **US4 (P6)** → **Polish (P7)**
- Foundational BLOCKS all stories (shared entity + repository).

### Story dependencies
- **US1 (P1)**: after Foundational. Rewrites the macro fetch path — the structural change other stories build on. **MVP.**
- **US2 (P2)**: after Foundational; independently testable. Its use-case/API/dashboard edits serialize **after** US1's edits to those same three files (T028→after T024, T029→after T025, T030→after T026).
- **US3 (P2)**: after Foundational; independently testable. Domain service (T032/T033) is fully parallel; the use-case/API/dashboard edits serialize after US2's (T034→after T028, etc.).
- **US4 (P3)**: depends on **US1** (needs `macroContext` stored on the prior record). Use-case edit serializes after US3's.

### Shared-file serialization (not `[P]` across stories)
- `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`: T024 → T028 → T034 → T038
- `src/functions/getWeeklyAnalysis.js`: T025 → T029 → T035
- `dashboard/src/pages/analysis-detail.astro`: T026 → T030 → T036

### Parallel opportunities
- **Setup**: T001, T002 in parallel.
- **Foundational**: T004 (entity test) parallel with T006 (repo test) authoring; T003 before T005.
- **US1 providers**: T007–T018 are all `[P]` (independent files) — the biggest parallel batch. T019 (IMF) needs T017 (classify). T021 (orchestrator) needs the providers. T023 (DI) needs T021.
- **US3**: T032/T033 (domain service + test) parallel with anything.
- **Polish**: T040, T041, T042 in parallel.

---

## Parallel Example: User Story 1 providers

```bash
# After Foundational, launch the independent provider builds together:
Task: "T007 IFxGapProvider + DolarApiFxGapProvider"
Task: "T009 IBcraMonetariasProvider + BcraMonetariasProvider"
Task: "T011 IInflationProvider + ArgentinaDatosInflationProvider"
Task: "T013 IFredProvider + FredProvider"
Task: "T015 ISp500DrawdownProvider + StooqSp500Provider"
Task: "T017 AnthropicLLMClient.classify()"
# Then T019 (IMF, needs classify) → T021 (orchestrator) → T023 (DI) → T024 (use-case)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)
1. Setup (T001–T002) → Foundational (T003–T006).
2. US1 (T007–T027) — the macro panel end to end.
3. **STOP & VALIDATE**: all 9 indicators captured/shown; kill one source → run still completes (SC-001, SC-002, SC-003). Deploy/demo.

### Incremental delivery
- + US2 (totals) → validate FR-014 → demo.
- + US3 (position changes) → validate SC-005 → demo.
- + US4 (trend context) → validate → demo.
- Polish (T040–T043).

### Notes
- `[P]` = different files, no incomplete-task dependency.
- The three shared files serialize across stories — respect the ordering above to avoid conflicts.
- All fixtures use fake holdings; scan every diff for Privacy First before staging.
- Commit after each task or logical group; conventional messages (`feat:`, `test:`, `refactor:`).
