---
description: "Task list for Portfolio Growth vs Benchmarks"
---

# Tasks: Portfolio Growth vs Benchmarks (indexed)

**Input**: Design documents from `/specs/009-performance-benchmarks/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: Included — Constitution IV requires tests for the use-case, the pure domain services
(aligner, AR-CPI index), provider methods, and the pure charting helper. SVG rendering is visual UI
(exempt). Fixtures use clearly-fake holdings.

**Organization**: Tasks grouped by user story. Files touched by multiple stories —
`GetPerformanceSeries.js`, `performance.astro`, `charts.cjs` — are serialized (not `[P]` across
stories). The backend performance endpoint (Phase 2) blocks the UI stories.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish have no story label)

## Path Conventions

Backend: `src/`. Dashboard: `dashboard/src/`. Tests: `tests/unit/`.

---

## Phase 1: Setup

- [x] T001 [P] Add a "Performance" navigation entry pointing to `/performance` in `dashboard/src/layouts/Layout.astro` (add `'performance'` to the `active` union and the nav list; page built in US1).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The performance-series endpoint that the UI reads. Portfolio value + MEP come from
feature 006 (`getLatest`); benchmark slots are present (populated in US2). Providers are injected now
so US2 only fills in the fetch logic.

**⚠️ CRITICAL**: Blocks the UI stories.

- [x] T002 [P] `GetPerformanceSeries` use-case in `src/application/use-cases/analysis/GetPerformanceSeries.js`: constructor takes `{ analysisRepository, fredProvider, inflationProvider }`. `execute({ weeks })` → `getLatest(weeks)` → ascending points `{ date, portfolioValueUsd (grandTotalUsd|null), mep:{value:mepRate, asOf, available} }` plus `sp500`/`usCpi`/`arCpi` slots as `{value:null,asOf:null,available:false}` for now; clamp `weeks` (default 60, 1–200); return `{ points, count, benchmarksAvailable }`.
- [x] T003 [P] Unit test `tests/unit/application/use-cases/analysis/GetPerformanceSeries.test.js`: ascending by date; portfolio value + MEP mapped from totals; `weeks` clamp; analyses with null totals tolerated; empty → `{ points: [], count: 0 }`.
- [x] T004 Wire `GetPerformanceSeries` into `src/application/use-cases/index.js` and `src/application/di/container.js` (`getGetPerformanceSeries()` — inject `analysisRepository`, a `FredProvider` with the key from `process.env['analysis.fredApiKey'] || FRED_API_KEY`, and `ArgentinaDatosInflationProvider`).
- [x] T005 `src/functions/getPerformanceSeries.js`: `GET /api/analysis/performance` (auth `function`, `?weeks=`), call the use-case, respond per contracts/api.md — AND register it in `src/functions/index.js` (the feature-007 registration guard test fails otherwise).

**Checkpoint**: `GET /api/analysis/performance` returns portfolio value + MEP per date.

---

## Phase 3: User Story 1 - Indexed growth: portfolio vs holding USD (Priority: P1) 🎯 MVP

**Goal**: Portfolio total value and MEP each indexed to 100 over the window, overlaid on one chart.
Uses only persisted data (no benchmark fetch).

**Independent Test**: Open the page with several weeks → portfolio + MEP lines both start at 100 and
track their weekly values; a sharp value jump (deposit) shows as a step.

- [x] T006 [US1] `dashboard/src/lib/charts.cjs`: add pure `indexTo100(series)` (rebase first available value → 100, `v_i/v_0×100`; gaps stay null; no base → all null) and `multiLineSvg(seriesList, opts)` renderer (multiple series on ONE shared y-axis — all start at 100 — with legend, distinct colors, gaps per series).
- [x] T007 [P] [US1] Unit test in `tests/unit/lib/charts.test.js`: `indexTo100` rebases to 100, preserves gaps as null, returns all null when no base value exists.
- [x] T008 [US1] `dashboard/src/pages/performance.astro`: fetch `/analysis/performance`, build `indexTo100` series for the portfolio value and MEP, render `multiLineSvg`; loading/error + empty/sparse ("insufficient history") states; label the portfolio line as value growth (deposits show as steps).

**Checkpoint**: US1 = the MVP — "did my value grow faster than holding USD?", zero benchmark fetching.

---

## Phase 4: User Story 2 - Benchmark overlays: S&P 500 and inflation (Priority: P2)

**Goal**: Overlay S&P 500 + US/AR inflation, indexed to 100, fetched server-side on-demand.

**Independent Test**: With benchmark levels available, the S&P and inflation lines index to 100 and
overlay; a date preceding a benchmark's series is a gap; a failed benchmark is marked unavailable.

- [x] T009 [P] [US2] Extend `src/infrastructure/providers/FredProvider.js` with `getObservations(seriesId, { start, end, units })` → `[{ date, value }]` over the range (parse string values, skip `"."`); reuse the existing key/auth/error handling; missing key → `FredConfigError`.
- [x] T010 [P] [US2] Unit test `tests/unit/infrastructure/providers/FredProvider.test.js` (add cases): `getObservations` passes `observation_start`/`observation_end`, parses rows, handles `"."`, missing key → `FredConfigError`.
- [x] T011 [P] [US2] Extend `src/infrastructure/providers/ArgentinaDatosInflationProvider.js` with `getSeries()` → full monthly series `[{ date, percent }]` ascending.
- [x] T012 [P] [US2] `ArCpiIndex` pure service in `src/domain/services/ArCpiIndex.js`: `build(monthly)` → cumulative level index `[{ date, value }]`, `value_n = value_{n-1} × (1 + percent_n/100)`, anchored at 100.
- [x] T013 [P] [US2] Unit test `tests/unit/domain/services/ArCpiIndex.test.js`: compounding correctness, ascending order, anchor at 100.
- [x] T014 [P] [US2] `BenchmarkAligner` pure service in `src/domain/services/BenchmarkAligner.js`: `alignOnOrBefore(observations, dates)` → per date the latest obs with `obsDate ≤ date` (carry its date as `asOf`), else a gap (`available:false`).
- [x] T015 [P] [US2] Unit test `tests/unit/domain/services/BenchmarkAligner.test.js`: on/before match, exact match, date before series → gap, empty observations → all gaps.
- [x] T016 [US2] In `GetPerformanceSeries.js`, fetch in parallel (`Promise.allSettled`): FRED `SP500`, FRED `CPIAUCSL`, and AR CPI (`inflationProvider.getSeries()` → `ArCpiIndex.build`) over the date span; `BenchmarkAligner.alignOnOrBefore` each to the analysis dates; populate `sp500`/`usCpi`/`arCpi` per point + `benchmarksAvailable`; a failed source → that benchmark unavailable, others proceed (serializes after T002 — same file; depends on T009/T011/T012/T014).
- [x] T017 [P] [US2] Unit test in `GetPerformanceSeries.test.js`: benchmarks populated from mocked providers/aligner; one provider rejecting → that benchmark `available:false` everywhere, others + portfolio/MEP still present (SC-004).
- [x] T018 [US2] `dashboard/src/pages/performance.astro`: benchmark toggles (S&P 500 / US CPI / AR CPI) that `indexTo100` and overlay the selected benchmarks; an unavailable benchmark is shown as such, not fabricated (serializes after T008 — same file).

**Checkpoint**: "Did I beat the index / beat inflation?" readable on one chart.

---

## Phase 5: User Story 3 - Summary and range (Priority: P3)

**Goal**: Growth-% summary per series + a range selector that re-bases every series to 100.

**Independent Test**: Summary shows each series' growth % and the portfolio-vs-benchmark gap; changing
the range re-indexes all series to 100 at the new window start.

- [x] T019 [US3] `dashboard/src/lib/charts.cjs`: add pure `growthPct(series)` (last available index − 100) and render a summary in `performance.astro` (each series' growth % over the window + portfolio-minus-benchmark gap) (charts.cjs append, after T006; page uses it).
- [x] T020 [P] [US3] Unit test in `tests/unit/lib/charts.test.js`: `growthPct` on a series indexed to 100 returns last − 100; handles all-gap (null).
- [x] T021 [US3] `dashboard/src/pages/performance.astro`: range selector (8/26/52/all) that slices points (`sliceLastN`), **re-indexes every series to 100** at the new window start, and redraws (serializes after T018 — same file).

**Checkpoint**: All three stories functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T022 [P] Privacy scan of the diff: no real holdings/secrets; the FRED key is read server-side only (never in client bundle); fixtures use placeholder values (Constitution I).
- [x] T023 Run `quickstart.md` end-to-end (incl. `dashboard` build) and verify SC-001…SC-006 (indexed to 100, deposits-as-steps, beat-USD/index/inflation reads, gaps/unavailable shown, range re-bases, sparse state).

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** → **US3 (P5)** → **Polish (P6)**
- Foundational (the endpoint) BLOCKS the UI stories.

### Shared-file serialization (not `[P]` across stories)
- `src/application/use-cases/analysis/GetPerformanceSeries.js`: T002 → T016
- `dashboard/src/pages/performance.astro`: T008 → T018 → T021
- `dashboard/src/lib/charts.cjs`: T006 → T019
- `tests/unit/lib/charts.test.js`: T007 → T020
- `src/application/di/container.js` + `use-cases/index.js`: T004
- `src/functions/index.js`: T005

### Parallel opportunities
- **Foundational**: T002 + T003 parallel; T004/T005 after T002.
- **US2 is highly parallel**: T009–T015 (two provider methods + two pure services + their tests) are all `[P]` (different files); only T016 (orchestration) depends on them, and T018 (page) on T008.
- The whole US2 backend (providers/services) can be built alongside US1's UI (different files).

---

## Implementation Strategy

### MVP First (User Story 1)
1. Setup (T001) → Foundational (T002–T005): the endpoint with portfolio value + MEP.
2. US1 (T006–T008): the indexed portfolio-vs-MEP chart.
3. **STOP & VALIDATE**: both lines start at 100 and track; a deposit shows as a step (SC-001, SC-006). Deploy/demo — works with no FRED key.

### Incremental delivery
- + US2 (S&P + inflation overlays) → validate beat-index/beat-inflation + resilience (SC-002, SC-004) → demo.
- + US3 (summary + range) → validate re-basing (SC-003) → demo.
- Polish (T022–T023).

### Notes
- `[P]` = different files, no incomplete-task dependency.
- Respect the shared-file ordering above to avoid conflicts.
- Register the new function in `src/functions/index.js` (T005) — the 007 guard test enforces it.
- The FRED key stays server-side; all fixtures use fake holdings; scan every diff for Privacy First.
