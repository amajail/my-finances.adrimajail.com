---
description: "Task list for Macro Charts Dashboard"
---

# Tasks: Macro Context Time-Series Dashboard

**Input**: Design documents from `/specs/008-macro-charts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: Included — Constitution IV requires tests for the use-case and the pure charting
helpers. SVG rendering is visual UI (exempt; covered by the Astro build + quickstart). Fixtures
use clearly-fake holdings.

**Organization**: Tasks grouped by user story. Two files are extended by multiple stories —
`dashboard/src/lib/charts.js` (one module, a new function per story) and
`dashboard/src/pages/charts.astro` (the page) — so those edits are serialized (not `[P]` across
stories). The backend data path (Phase 2) blocks all UI stories.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 / US4 / US5 (Setup, Foundational, Polish have no story label)

## Path Conventions

Backend: `src/`. Dashboard: `dashboard/src/`. Tests: `tests/unit/`.

---

## Phase 1: Setup

- [ ] T001 [P] Add a "Charts" navigation entry pointing to `/charts` in `dashboard/src/layouts/Layout.astro` (add `'charts'` to the `active` union and the nav list; page built in US1).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The series projection endpoint that every chart reads. No new repo method/storage —
`getLatest` already returns `macroContext` + `portfolioTotals` (feature 006).

**⚠️ CRITICAL**: Blocks all user stories.

- [ ] T002 [P] `GetMacroSeries` use-case in `src/application/use-cases/analysis/GetMacroSeries.js`: call `analysisRepository.getLatest(weeks)`, map each `WeeklyAnalysis` to `{ date, macroContext, portfolioTotals }`, return ascending by date as `{ points, count }`; clamp `weeks` (default 60, 1–200).
- [ ] T003 [P] Unit test `tests/unit/application/use-cases/analysis/GetMacroSeries.test.js`: ascending order; `weeks` clamp; analyses with null macro/totals tolerated; empty → `{ points: [], count: 0 }`.
- [ ] T004 Wire `GetMacroSeries` into `src/application/use-cases/index.js` and `src/application/di/container.js` (`getGetMacroSeries()`).
- [ ] T005 `src/functions/getMacroSeries.js`: `GET /api/analysis/macro-series` (auth `function`, `?weeks=`), call the use-case, respond per contracts/api.md — AND register it in `src/functions/index.js` (the feature-007 registration guard test fails otherwise).

**Checkpoint**: `GET /api/analysis/macro-series` returns the ascending projection.

---

## Phase 3: User Story 1 - Small-multiples of every metric over time (Priority: P1) 🎯 MVP

**Goal**: One independently-scaled mini-chart per macro indicator and portfolio total, sharing the
analysis-date axis, with value + as-of on hover.

**Independent Test**: Open the Charts page with several analyses → a mini-chart per metric, shared
date axis, independent scales, hover shows value + as-of.

- [ ] T006 [US1] `dashboard/src/lib/charts.js`: pure helpers `buildSeries(points, key)` → `[{date, value|null, asOf, available}]` (value only when present + `available !== false` + finite, else null/gap) and `niceScale(min, max)` → rounded axis bounds. Export the metric catalogue (data-model.md).
- [ ] T007 [P] [US1] Unit test `tests/unit/lib/charts.test.js`: `buildSeries` maps macro + totals keys, marks unavailable/non-finite as `null`; `niceScale` bounds sane values.
- [ ] T008 [US1] `dashboard/src/lib/charts.js`: SVG line-chart renderer `lineChart(el, series, opts)` — dots + connecting path, date x-axis, independent y-axis from `niceScale`, hover tooltip (value + asOf) (same file, after T006).
- [ ] T009 [US1] `dashboard/src/pages/charts.astro`: fetch `/analysis/macro-series`, render a grid of mini-charts (each numeric macro indicator + each portfolio total) via `lineChart`, all sharing the date axis; loading + error states (depends on T005, T008).

**Checkpoint**: US1 = the MVP — the small-multiples trend grid.

---

## Phase 4: User Story 2 - Missing data is visible, not hidden (Priority: P2)

**Goal**: Unavailable weeks are distinct gaps (never 0, never interpolated); the page is sane with
few/zero points.

**Independent Test**: An indicator unavailable for a week shows a gap/marker, no line through it; 0/1 points render gracefully.

- [ ] T010 [US2] `dashboard/src/lib/charts.js`: in `lineChart`, break the path at `null` points and draw a distinct "unavailable" marker; never plot 0 for a gap (same file, after T008).
- [ ] T011 [US2] `dashboard/src/pages/charts.astro`: friendly empty state (0 points) and single-point/sparse handling ("not enough history yet") (same file, after T009).
- [ ] T012 [P] [US2] Unit test in `tests/unit/lib/charts.test.js`: a series with interior gaps segments into non-contiguous runs (no value bridged across a `null`).

**Checkpoint**: Charts are decision-grade — gaps don't lie.

---

## Phase 5: User Story 3 - IMF review status as an event strip (Priority: P2)

**Goal**: Render the categorical IMF status as a labeled event strip, not a numeric line.

**Independent Test**: With IMF status changing over dates, the strip shows markers at changes aligned to the shared axis; unavailable → unknown/gap.

- [ ] T013 [P] [US3] `dashboard/src/lib/charts.js`: `imfChangePoints(points)` reducer (collapse consecutive equal statuses; `unavailable`/absent → `unknown`) + `eventStrip(el, changePoints, opts)` SVG renderer (same file — append; independent function).
- [ ] T014 [P] [US3] Unit test in `tests/unit/lib/charts.test.js`: `imfChangePoints` emits a point only at status changes; maps unavailable to `unknown`.
- [ ] T015 [US3] `dashboard/src/pages/charts.astro`: render the IMF event strip aligned to the shared date axis (same file, after T011).

**Checkpoint**: Full macro picture without distorting the categorical onto a numeric axis.

---

## Phase 6: User Story 4 - Overlay two series on a dual axis (Priority: P3)

**Goal**: Pair one portfolio series + one macro series on one chart with independent left/right axes.

**Independent Test**: Pick a portfolio and a macro series → one chart, two scales, shared date axis; gaps per series.

- [ ] T016 [US4] `dashboard/src/lib/charts.js`: `dualAxisChart(el, seriesLeft, seriesRight, opts)` — two independent `niceScale`s, left/right axes, shared x, gaps per series (same file — append).
- [ ] T017 [US4] `dashboard/src/pages/charts.astro`: overlay mode — two selects (one portfolio key, one macro key) + a small-multiples/overlay toggle; render via `dualAxisChart` (same file, after T015).
- [ ] T018 [P] [US4] Unit test in `tests/unit/lib/charts.test.js`: dual-axis computes two independent scales (a thousands-range series and a near-zero series each scale to their own bounds).

**Checkpoint**: Correlation view available.

---

## Phase 7: User Story 5 - Range selector (Priority: P3)

**Goal**: Limit charts to last 8 / 26 / 52 / all points, client-side.

**Independent Test**: Pick a range → all charts redraw to that window; fewer points than the window shows all.

- [ ] T019 [US5] `dashboard/src/pages/charts.astro`: a range control (8/26/52/all) that slices the fetched points and re-renders every chart/strip/overlay (same file, after T017).
- [ ] T020 [P] [US5] Unit test in `tests/unit/lib/charts.test.js`: a `sliceLastN(points, n)` helper returns the last n (or all when fewer); add the helper to `charts.js`.

**Checkpoint**: All five stories functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T021 [P] Privacy scan of the diff: no real holdings/secrets; fixtures use placeholder values (Constitution I).
- [ ] T022 Run `quickstart.md` end-to-end (incl. `dashboard` build) and verify SC-001…SC-006 (independent scales, gaps≠zero, as-of on hover, overlay, range, sparse/empty).

---

## Dependencies & Execution Order

### Phase order
- **Setup (P1)** → **Foundational (P2)** → **US1 (P3)** → **US2 (P4)** → **US3 (P5)** → **US4 (P6)** → **US5 (P7)** → **Polish (P8)**
- Foundational (the series endpoint) BLOCKS all UI stories.

### Shared-file serialization (not `[P]` across stories)
- `dashboard/src/lib/charts.js`: T006 → T008 → T010 → T013 → T016 → T020 (each adds/refines a function)
- `dashboard/src/pages/charts.astro`: T009 → T011 → T015 → T017 → T019
- `tests/unit/lib/charts.test.js`: authored at T007, appended at T012/T014/T018/T020 (same file — sequential)
- `src/application/di/container.js` + `use-cases/index.js`: T004
- `src/functions/index.js`: T005 (registration)

### Parallel opportunities
- **Foundational**: T002 (use-case) + T003 (its test) parallel; T004/T005 after T002.
- **US1**: T006 + T007 (helper + test) parallel; T008 after T006; T009 after T005+T008.
- The backend (T002–T005) can be built fully in parallel with starting `charts.js` helpers (T006/T007), since they're different files.

---

## Implementation Strategy

### MVP First (User Story 1)
1. Setup (T001) → Foundational (T002–T005): the series endpoint.
2. US1 (T006–T009): the small-multiples grid.
3. **STOP & VALIDATE**: every metric has an independently-scaled mini-chart on a shared date axis; hover shows value + as-of (SC-001, SC-002, SC-006). Deploy/demo.

### Incremental delivery
- + US2 (gaps + sparse states) → + US3 (IMF strip) → + US4 (overlay) → + US5 (range). Polish (T021–T022).

### Notes
- `[P]` = different files, no incomplete-task dependency.
- Respect the `charts.js` / `charts.astro` ordering to avoid conflicts.
- Register the new function in `src/functions/index.js` (T005) — the 007 guard test enforces it.
- All fixtures use fake holdings; scan every diff for Privacy First before staging.
