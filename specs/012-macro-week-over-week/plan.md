# Implementation Plan: Macro Week-over-Week Comparison

**Branch**: `012-macro-week-over-week` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-macro-week-over-week/spec.md`

## Summary

Add a deterministic, code-computed week-over-week comparison of the numeric macro indicators to the weekly analysis. Mirrors feature 006's `PositionChangeCalculator`: a new pure `MacroChangeCalculator.diff(priorMacro, currentMacro)` compares the current run's `macroContext` against the prior analysis's `macroContext` (already loaded in `GenerateWeeklyAnalysis`), producing one row per numeric indicator with prior/current value + as-of date, absolute change, and percent change. Persisted as an optional `macroChanges` field on `WeeklyAnalysis` (feature-006/010 JSON-column pattern) and rendered as a distinct table on the analysis detail page. No new data source, no charts change, no LLM change.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4 backend); Astro dashboard (one new render section, no UI logic libs).

**Primary Dependencies**: `@azure/data-tables` (persistence). **No new dependencies.** No LLM involvement (purely code-computed).

**Storage**: Azure Table Storage. One new optional JSON column on `portfolioAnalysis` (`macroChangesJson`); no new tables/settings.

**Testing**: Jest. New `MacroChangeCalculator` unit tests + `WeeklyAnalysis` validation + repository round-trip (Constitution Principle IV). Astro render exempt.

**Target Platform**: Azure Functions (analysis runs) + Static Web Apps (dashboard).

**Project Type**: Web app (backend `src/` + dashboard `dashboard/`).

**Performance Goals**: N/A — single run/week, ~8 indicators compared in memory; trivial. Zero added tokens (no LLM).

**Constraints**: Optional/absent on first run + pre-feature rows (FR-006/007); no divide-by-zero (FR-010); distinct from the two existing week-over-week-ish tables (FR-009); no new data source (FR-011); charts + LLM section untouched (FR-013).

**Scale/Scope**: ~52 analyses/year; a handful of files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Privacy First (NON-NEGOTIABLE) | ✅ Pass | Computed entirely from data already captured per run; no new egress, no new data fetched; nothing real committed. |
| II. Clean Architecture / DDD | ✅ Pass | New pure domain service `MacroChangeCalculator` (sibling of `PositionChangeCalculator`); use case stays thin; rendering in the Astro page. |
| III. Idempotent Data Operations | ✅ Pass | No seeders/data writes; whole-record replace already covers re-runs (FR-012). |
| IV. Pragmatic Testing | ✅ Pass | Calculator + entity + repo round-trip unit-tested; UI exempt. |
| V. Convention-Driven Workflow | ✅ Pass | Branch `012-macro-week-over-week` (bare `NNN-kebab`, constitution v1.1.1), from a fresh main. |

No violations. No dependencies to justify.

## Project Structure

### Documentation (this feature)

```text
specs/012-macro-week-over-week/
├── plan.md              # This file
├── research.md          # Phase 0 — calc decisions (key set, %-change, skip rules)
├── data-model.md        # Phase 1 — MacroChangeRow shape, entity field, persistence
├── quickstart.md        # Phase 1 — verify locally (needs two consecutive analyses)
├── contracts/
│   └── api-additions.md  # the GET /api/analysis/weekly/{date} response delta
├── spec.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── services/
│   │   └── MacroChangeCalculator.js          # NEW — pure: diff(priorMacro, currentMacro) → rows | null
│   └── entities/
│       └── WeeklyAnalysis.js                 # + optional `macroChanges` field (validation, toJSON, freeze)
├── application/use-cases/analysis/
│   └── GenerateWeeklyAnalysis.js             # compute macroChanges from previousAnalysis.macroContext + macroContext
├── infrastructure/repositories/
│   └── AzureAnalysisRepository.js            # + macroChangesJson column (feature-006/010 pattern)
└── functions/
    └── getWeeklyAnalysis.js                  # expose `macroChanges` in the detail response

dashboard/src/pages/
└── analysis-detail.astro                     # NEW "Macro — week over week" section + render fn

tests/ (Jest)
├── unit/domain/services/MacroChangeCalculator.test.js
├── unit/domain/entities/WeeklyAnalysis.macroChanges.test.js
└── unit/infrastructure/repositories/AzureAnalysisRepository.macroChanges.test.js
```

**Structure Decision**: Pure extension of the feature-006 macro-capture + change-calculator pattern and the feature-006/010 persistence/render patterns. The one new unit is `MacroChangeCalculator`, placed in `src/domain/services/` beside `PositionChangeCalculator`.

## Key facts that shape the approach

- **Inputs already exist.** `GenerateWeeklyAnalysis` loads `previousAnalysis` (`:181`) and already reads `previousAnalysis.macroContext` (`:193`); the current `macroContext` is computed in the same run. So the diff is `MacroChangeCalculator.diff(previousAnalysis?.macroContext, macroContext)`, slotted right after the `positionChanges` line (`:188`).
- **Reading shape is uniform.** Every macro reading is `{ value, asOf, available }` (unavailable → `{value:null, asOf:null, available:false}`). The calculator includes a key only when both prior and current are present, `available !== false`, and the value is numeric.
- **Numeric indicator set + labels** (excludes the textual `imfReviewStatus`): `riesgoPais` (Riesgo país, bp), `fxGap` (MEP/official gap, %), `bcraReserves` (BCRA reserves, USD M), `argInflation` (Monthly inflation, %), `argInterestRate` (Policy rate, %), `usaInflation` (CPI YoY, %), `usaInterestRate` (Fed funds upper, %), `sp500Drawdown` (S&P 500 drawdown, %). A small key→{label,unit} map lives in the calculator (matching the panel's `MACRO_GROUPS`); keys outside it are skipped, which naturally excludes non-numeric indicators.
- **Distinct from existing tables (FR-009).** Three sibling sections on the detail page: "Changes this week" (positions, feature 006), "Week-over-week (analytical)" (LLM, feature 010), and the new "Macro — week over week" (this feature) — clearly labeled.

## Complexity Tracking

No constitution violations; no new dependencies, tables, or settings. Nothing to justify.

## Phase notes

- **Phase 0 (research.md):** locks the numeric-key set + labels, the percent-change rule (omit when prior is zero), and the skip rules — all derivable from the existing macro shape; no `NEEDS CLARIFICATION`.
- **Phase 1 (data-model.md, contracts/, quickstart.md):** the `MacroChangeRow` shape, the optional entity field + JSON column, the response delta, and a local verification that needs two consecutive analyses (the second one shows the comparison).
