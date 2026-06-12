# Implementation Plan: Macro Context Time-Series Dashboard

**Branch**: `008-macro-charts` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-macro-charts/spec.md`

## Summary

A new read-only dashboard page that charts the weekly macro panel and key portfolio totals over
time, turning feature 006's per-week snapshots into visible trends. Small-multiples (one
independently-scaled mini-chart per metric, shared analysis-date x-axis); the IMF status as a
categorical event strip; unavailable weeks shown as gaps (never zero/interpolated); as-of on
hover; a dual-axis overlay pairing one portfolio series with one macro series; and a client-side
range selector. Data comes from a thin new `GET /api/analysis/macro-series` projection over the
existing `getLatest` read — **no new storage, no new repository method**. Charts are **hand-rolled
SVG** (zero new dependencies). See [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/api.md](./contracts/api.md).

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4); Astro (dashboard).

**Primary Dependencies**: `@azure/data-tables` (existing). **Zero new npm packages** — charts are
hand-rolled SVG + vanilla JS.

**Storage**: None added. Read-only projection over the existing `portfolioAnalysis` table
(`macroContext`/`portfolioTotals` columns from feature 006).

**Testing**: Jest (`test:unit`); Astro build via `pr-checks.yml`.

**Target Platform**: Azure Functions (Linux) backend + Azure Static Web Apps (dashboard).

**Project Type**: Web (Functions backend + Astro frontend) — existing structure.

**Performance Goals**: Render ≤ ~2 s for up to 52 weeks (SC-005); tiny payload (≤ ~52 points).

**Constraints**: Constitution Privacy First — the new endpoint returns the same portfolio totals
the detail endpoint already exposes (no holdings, no per-position data), under `function` auth; no
new external egress. Builds on feature 006 (in production).

**Scale/Scope**: 1 new read endpoint + use-case (+ test); 1 charting helper module (pure helpers
unit-tested); 1 new dashboard page + nav link.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0.*

| Principle | Status | Notes |
|---|---|---|
| **I. Privacy First (NON-NEGOTIABLE)** | ✅ PASS | Read-only; returns only macro (public) + aggregate portfolio totals already exposed by the detail endpoint; no per-position data, no new egress, nothing committed. Fixtures fake. |
| **II. Clean Architecture / DDD** | ✅ PASS | `GetMacroSeries` use-case (projection) behind the existing `IAnalysisRepository`; thin HTTP function; charts are presentation. Pure series-shaping helpers extracted for testability. |
| **III. Idempotent Data Operations** | ✅ PASS | Pure read; no writes, no seed changes. |
| **IV. Pragmatic Testing** | ✅ PASS | Unit tests for `GetMacroSeries` and the pure `charts.js` helpers (series/gap building, scale, IMF reducer). SVG rendering is visual UI (exempt), covered by the Astro build + quickstart. |
| **V. Convention-Driven Workflow** | ✅ PASS (note) | SDD pipeline; spec-kit numbered branch (consistent with 005–007). New function registered in `src/functions/index.js` (guard test from 007 enforces it). |

**Gate result: PASS** — **no new dependencies, tables, or storage**; nothing to justify in
Complexity Tracking.

## Project Structure

### Documentation (this feature)
```text
specs/008-macro-charts/
├── plan.md          # This file
├── spec.md          # Feature spec
├── research.md      # Phase 0 — charting + data-source decisions
├── data-model.md    # Phase 1 — projection + client series model
├── quickstart.md    # Phase 1 — verification recipe
├── contracts/
│   └── api.md       # GET /api/analysis/macro-series
├── checklists/
│   └── requirements.md
└── tasks.md         # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)
```text
src/
├── application/
│   ├── use-cases/analysis/
│   │   └── GetMacroSeries.js          # NEW — project getLatest → ascending series
│   └── di/container.js                # wire GetMacroSeries
└── functions/
    ├── getMacroSeries.js              # NEW — GET /api/analysis/macro-series
    └── index.js                       # register the new function
dashboard/src/
├── lib/
│   └── charts.js                      # NEW — pure helpers (buildSeries, niceScale, imfChangePoints) + SVG renderers
├── pages/
│   └── charts.astro                   # NEW — small-multiples grid, IMF strip, overlay, range selector
└── layouts/Layout.astro               # add "Charts" nav link

tests/
└── unit/
    ├── application/use-cases/analysis/GetMacroSeries.test.js   # NEW
    └── lib/charts.test.js                                      # NEW — pure helpers (buildSeries/niceScale/imf)
```

**Structure Decision**: Reuse the existing clean/DDD layout. Backend adds one projection use-case
+ thin function (no new repo method — `getLatest` already returns macro/totals). Frontend adds one
page + one charting helper module; the non-visual helper logic is unit-tested, the SVG rendering
is visual UI. The new function is registered in `src/functions/index.js` (the 007 guard test will
catch an omission).

## Complexity Tracking

No constitution violations. No new dependencies, tables, or storage. Nothing to justify.

## Phase boundary

This plan ends at Phase 1 (design + contracts). Phase 2 (`tasks.md`) is produced by
`/speckit-tasks`. No code is written by `/speckit-plan`.
