# Phase 0 Research: Macro Context Time-Series Dashboard

**Feature**: 008-macro-charts | **Date**: 2026-06-12

The spec has no open product clarifications. The decisions below are the design/architecture
choices (Decision / Rationale / Alternatives), grounded in the existing code.

---

## A. Charting approach — hand-rolled SVG (zero new dependencies)

- **Decision**: Render the charts with **hand-rolled inline SVG + vanilla JS** in the dashboard,
  via a small reusable helper module (`dashboard/src/lib/charts.js`). No charting library.
- **Rationale**: The data is tiny (≤52 points), the charts are simple (line sparklines, an event
  strip, a dual-axis overlay), and the dashboard currently has **no** charting dependency. The
  constitution requires justifying any new runtime dependency; hand-rolled SVG avoids that
  entirely and gives full control over the two requirements a generic lib makes awkward:
  (1) **gaps must not interpolate** (break the path at unavailable points), and (2) **as-of on
  hover** (custom tooltip content). Pure series-shaping logic (scaling, gap segmentation) is
  extracted into testable functions; SVG rendering itself is visual UI (Constitution IV exempt).
- **Alternatives**:
  - **uPlot** (~50 KB, zero-dep, very fast) — excellent for many small charts and dual-axis, but
    adds a dependency to justify and its low-level API still needs custom tooltips/gap handling;
    not worth it at this data scale.
  - **Chart.js** (~50 KB gzip + deps) — easy API but heavier, one instance per mini-chart, and
    silent gap/interpolation behavior must be fought. Rejected.
  - Decision is reversible: if interactivity needs grow, swapping the helper for uPlot is local to
    `charts.js` + the page.

## B. Data source — thin projection over `getLatest` (no new storage, no new repo method)

- **Decision**: New `GetMacroSeries` use-case calls the existing
  `IAnalysisRepository.getLatest(limit)` (already returns `WeeklyAnalysis[]` with `macroContext` +
  `portfolioTotals` from feature 006), projects each to `{ date, macroContext, portfolioTotals }`,
  and returns them **chronologically ascending** (getLatest is newest-first → reverse). New
  `GET /api/analysis/macro-series?weeks=N` exposes it.
- **Rationale**: Confirmed live — `_analysisFromEntity` (lines 281–322) deserializes
  `macroContext`/`portfolioTotals`, and `getLatest` maps every row through it. So the series is a
  pure read projection; no new repository method, no new table, no new storage (FR-009).
- **`weeks` parameter**: the endpoint accepts a window (default a generous cap, e.g. 60; clamped),
  but the **range selector is applied client-side** over the returned points (so switching
  8/26/52/all re-slices without a refetch). The endpoint just bounds the max payload.
- **Alternatives**: a dedicated `listMacroSeries` repo method — rejected (getLatest already
  returns exactly what's needed; a thin use-case projection is cleaner). Server-side range slicing
  — rejected (tiny payload; client slicing is snappier for the selector).

## C. Endpoint shape & ordering

- **Decision**: Response `{ points: [{ date, macroContext, portfolioTotals }], count }`, ascending
  by date. Failed analyses that still carry `macroContext`/`portfolioTotals` are included (their
  readings are valid; spec edge case). Analyses lacking both contribute nothing
  (`macroContext: null` + `portfolioTotals: null`) — the client skips empty metrics per series.
- **Rationale**: Mirrors the macro/totals shape already returned by the detail endpoint, so the
  client reuses the same field names; ascending order is what charts want.
- **Privacy**: returns the same portfolio totals the detail endpoint already exposes, under the
  same `function` auth — no new privacy surface (just aggregated across dates). No holdings,
  no per-position data.

## D. Series model & rendering rules (client)

- **Numeric metrics** (8 macro + 4 totals): each → one mini-chart. Build the series by reading the
  metric across points; a point is a real value only when `available !== false` and the value is
  numeric — otherwise it is a **gap** (path breaks; the point is drawn as a distinct "unavailable"
  marker, never 0). Each mini-chart computes its own min/max ("nice" scale) — independent y-axes
  (FR-002, FR-004).
- **IMF status**: categorical → an **event strip**: a horizontal lane with a labeled marker at
  each date where the status differs from the prior; `unknown`/unavailable shown as a gap/neutral
  marker (FR-006).
- **Overlay**: pick one portfolio key + one macro key → one chart, left axis = portfolio series,
  right axis = macro series, shared date axis, each independently scaled; gaps per series (FR-007).
- **Tooltip**: hovering a point shows `value` + `asOf` (FR-003, FR-006). x-position by analysis
  date.
- **Range selector**: client-side slice to last 8 / 26 / 52 / all points (FR-008).
- **Empty/sparse**: 0 points → friendly empty state; 1 point → render the dot (or "not enough
  history yet"); never crash (FR-005).

## E. Testing strategy

- **Backend**: unit-test `GetMacroSeries` (projection correctness, ascending order, tolerates
  analyses with null macro/totals, respects `weeks`).
- **Frontend pure helpers**: extract and unit-test the non-visual logic in `charts.js` —
  `buildSeries(points, key)` (value vs gap segmentation), `niceScale(min,max)`, and the IMF
  change-point reducer. The SVG drawing + DOM/hover are visual UI (Constitution IV exempt;
  covered by the Astro build + manual quickstart).
- **Registration guard**: the new function must be added to `src/functions/index.js` — the
  registration guard test from feature 007 will fail if it is omitted (lesson learned).

## F. No new dependencies / tables / storage

- **Decision**: Zero new npm packages, zero new tables, zero new stored data.
- **Rationale**: hand-rolled SVG (A) + projection over existing reads (B). Clean constitution gate.
