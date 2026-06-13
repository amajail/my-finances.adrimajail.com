# Implementation Plan: Portfolio Growth vs Benchmarks (indexed)

**Branch**: `009-performance-benchmarks` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-performance-benchmarks/spec.md`

## Summary

A read-only **Performance** dashboard page that indexes the weekly portfolio total value to 100 and
overlays benchmarks (MEP, S&P 500, US/AR inflation) also indexed to 100, so the owner can see whether
their value outgrew holding USD, a passive index, and inflation. No cash-flow log and no time-weighted
return (reframed at clarification) — the portfolio line is raw value, with deposits shown as honest
steps. Portfolio value + MEP come from feature 006's persisted weekly totals (no fetch); the S&P 500 /
US CPI / AR CPI **levels** are fetched **server-side** on-demand (the FRED key must not reach the
browser) by a new `GET /api/analysis/performance` projection, aligned on/before each analysis date.
Indexing + charting reuse feature 008's hand-rolled SVG. See [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md).

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4); Astro (dashboard).

**Primary Dependencies**: `@azure/data-tables`, native `fetch`, existing `FredProvider` /
`ArgentinaDatosInflationProvider`. **Zero new npm packages.**

**Storage**: None added. Portfolio value + MEP from the existing `portfolioAnalysis` table (feature
006); benchmark levels fetched on-demand and not stored.

**Testing**: Jest (`test:unit`); Astro build via `pr-checks.yml`.

**Target Platform**: Azure Functions (Linux) backend + Azure Static Web Apps (dashboard).

**Performance Goals**: Render ≤ ~2 s for up to 52 weeks (SC-005); three benchmark fetches run in
parallel; portfolio + MEP are local (persisted).

**Constraints**: Constitution Privacy First — the FRED key stays server-side (the fetch is in the
Function, never the browser); the endpoint returns only aggregate totals already exposed elsewhere +
public benchmark levels; benchmark fetches are inbound reads (no holdings sent).

**Scale/Scope**: 1 new read endpoint + use-case; extend two existing providers (a range method + a
full-series method) + one pure aligner + a pure AR-CPI index builder; 2 new charting helpers; 1 new
dashboard page + nav link.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0.*

| Principle | Status | Notes |
|---|---|---|
| **I. Privacy First (NON-NEGOTIABLE)** | ✅ PASS | FRED key read from env in the Function — **never sent to the browser** (the fetch is server-side). Endpoint returns aggregate totals already exposed + public benchmark levels; benchmark fetches are inbound only (no holdings egress); nothing committed; fixtures fake. |
| **II. Clean Architecture / DDD** | ✅ PASS | `GetPerformanceSeries` use-case orchestrates the existing repo + providers; pure `BenchmarkAligner` + AR-CPI index builder (domain/services); thin HTTP function; charting is presentation. Providers extended behind their interfaces. |
| **III. Idempotent Data Operations** | ✅ PASS | Pure read; no writes, no seed changes. |
| **IV. Pragmatic Testing** | ✅ PASS | Unit tests for the use-case, the aligner, the AR-CPI index builder, `FredProvider.getObservations`, and `indexTo100`. SVG rendering is visual UI (exempt; Astro build + quickstart). |
| **V. Convention-Driven Workflow** | ✅ PASS (note) | SDD pipeline; spec-kit numbered branch; new function registered in `src/functions/index.js` (the 007 guard test enforces it). |

**Gate result: PASS** — no new dependencies, tables, or storage; nothing to justify in Complexity
Tracking. (The on-demand benchmark fetches are inbound public-data reads, not a new egress of holdings.)

## Project Structure

### Documentation (this feature)
```text
specs/009-performance-benchmarks/
├── plan.md  ├── spec.md  ├── research.md  ├── data-model.md  ├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)
```text
src/
├── domain/services/
│   ├── BenchmarkAligner.js              # NEW — pure alignOnOrBefore(observations, dates)
│   └── ArCpiIndex.js                    # NEW — pure monthly-% → cumulative level index
├── application/
│   ├── use-cases/analysis/
│   │   └── GetPerformanceSeries.js      # NEW — getLatest + benchmark fetches + alignment
│   └── di/container.js                  # wire GetPerformanceSeries
├── infrastructure/providers/
│   ├── FredProvider.js                  # + getObservations(seriesId, {start,end,units})
│   └── ArgentinaDatosInflationProvider.js  # + getSeries() (full monthly series)
└── functions/
    ├── getPerformanceSeries.js          # NEW — GET /api/analysis/performance
    └── index.js                         # register the new function
dashboard/src/
├── lib/charts.cjs                       # + indexTo100(series), multiLineSvg(seriesList, opts)
├── pages/performance.astro              # NEW — indexed overlay + summary + range + benchmark toggles
└── layouts/Layout.astro                 # add "Performance" nav link

tests/
└── unit/
    ├── domain/services/BenchmarkAligner.test.js      # NEW
    ├── domain/services/ArCpiIndex.test.js            # NEW
    ├── application/use-cases/analysis/GetPerformanceSeries.test.js  # NEW
    ├── infrastructure/providers/FredProvider.test.js # + getObservations cases
    └── lib/charts.test.js                            # + indexTo100
```

**Structure Decision**: Reuse the existing clean/DDD layout and feature 008's charting module. The
benchmark math is split into pure, testable domain services (`BenchmarkAligner`, `ArCpiIndex`); the
providers gain one method each behind their interfaces; the use-case orchestrates and stays thin. The
new function is registered in `src/functions/index.js` (007 guard test enforces it).

## Complexity Tracking

No constitution violations. No new dependencies, tables, or storage. Nothing to justify.

## Phase boundary

Ends at Phase 1 (design + contracts). Phase 2 (`tasks.md`) is produced by `/speckit-tasks`.
