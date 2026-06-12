# Implementation Plan: Suggestion Scorecard (Execution Tracking)

**Branch**: `007-suggestion-scorecard` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-suggestion-scorecard/spec.md`

## Summary

Close the loop on the weekly analysis's suggested orders. Add an owner-set execution status
(pending → executed/partial/skipped + optional note) to each suggested order, persisted **on the
order row** (no new table). The analysis detail page proposes a status per pending order by
matching it against the week's already-computed `positionChanges` (feature 006) — **propose-only**,
saved only on owner confirmation via a new `PATCH` endpoint. Once any order is marked, the week is
**permanently frozen**: the generation use-case skips re-runs for that date (no overwrite, no LLM
cost, no in-app force path). Each prior week's orders are fed to the next analysis **with their
execution status** so the model stops inferring execution. A new read-only scorecard endpoint +
dashboard page report the executed/partial/skipped mix and execution rate by conviction (no outcome
P&L this iteration). See [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/api.md](./contracts/api.md).

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4); Astro (dashboard).

**Primary Dependencies**: `@azure/data-tables`. **Zero new npm packages.**

**Storage**: Azure Table Storage. Existing `portfolioOrders` table extended with three columns
(`executionStatus`, `executionNote`, `executionUpdatedAt`). **No new tables.**

**Testing**: Jest (`test:unit`, `test:integration`); Astro build via `pr-checks.yml`.

**Target Platform**: Azure Functions (Linux) backend + Azure Static Web Apps (dashboard).

**Project Type**: Web (Functions backend + Astro frontend) — existing structure.

**Performance Goals**: Non-interactive writes; scorecard is one tiny table scan (~tens of orders/yr).
No latency target.

**Constraints**: Constitution Privacy First — execution status/note are owner data in the owner's
DB, never committed; dashboard writes use the existing function-key path (same as position
inline-edit). No new external egress. Builds on feature 006 (in production).

**Scale/Scope**: ~1 analysis/week, a handful of orders each; 1 new write endpoint, 1 new read
endpoint, 1 pure matcher, 2 use-cases, entity + repository extension, 2 dashboard surfaces.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0.*

| Principle | Status | Notes |
|---|---|---|
| **I. Privacy First (NON-NEGOTIABLE)** | ✅ PASS | No source-control exposure: execution status/notes live only in the runtime DB. No new external egress (no AI/web calls added). Dashboard write uses the established function-key endpoint pattern (position inline-edit precedent). Fixtures use fake holdings. |
| **II. Clean Architecture / DDD** | ✅ PASS | Pure `OrderExecutionMatcher` domain service; `SetOrderExecutionStatus` + `GetSuggestionScorecard` use-cases; new repository methods behind `IAnalysisRepository`; thin HTTP functions (parse → use-case → respond). Freeze guard lives in the generation use-case, not the function handler. |
| **III. Idempotent Data Operations** | ✅ PASS | `setOrderExecutionStatus` is a Merge on one row (idempotent). No seed-script changes. The **freeze guard prevents** the destructive re-run that would otherwise overwrite marked orders. |
| **IV. Pragmatic Testing** | ✅ PASS | Unit tests for the matcher, entity validation, the freeze guard, set-status, and scorecard aggregation; integration test for the status round-trip on `portfolioOrders`. |
| **V. Convention-Driven Workflow** | ✅ PASS (note) | SDD pipeline followed. Branch `007-suggestion-scorecard` (spec-kit numbered), consistent with 005/006; the PR may use a `feature/{kebab}` name. No new runtime deps. |

**Gate result: PASS** — no violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)
```text
specs/007-suggestion-scorecard/
├── plan.md            # This file
├── spec.md            # Feature spec (+ Clarifications)
├── research.md        # Phase 0 — design decisions
├── data-model.md      # Phase 1 — entity/value-object/storage model
├── quickstart.md      # Phase 1 — local dev + verification recipe
├── contracts/
│   └── api.md         # HTTP route additions (PATCH status, scorecard, detail fields)
├── checklists/
│   └── requirements.md
└── tasks.md           # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)
```text
src/
├── domain/
│   ├── entities/
│   │   └── SuggestedOrder.js            # + executionStatus, executionNote, executionUpdatedAt
│   └── services/
│       └── OrderExecutionMatcher.js     # NEW — pure propose(order, positionChanges)
├── application/
│   ├── interfaces/
│   │   └── IAnalysisRepository.js       # + setOrderExecutionStatus, hasMarkedOrders, listAllOrders
│   ├── use-cases/analysis/
│   │   ├── GenerateWeeklyAnalysis.js    # freeze guard (skip on marked date); feed prior statuses
│   │   ├── SetOrderExecutionStatus.js   # NEW
│   │   └── GetSuggestionScorecard.js    # NEW
│   └── di/
│       └── container.js                 # wire the two new use-cases
├── infrastructure/repositories/
│   └── AzureAnalysisRepository.js       # status columns; setOrderExecutionStatus, hasMarkedOrders, listAllOrders
├── functions/
│   ├── setOrderExecutionStatus.js       # NEW — PATCH /api/analysis/weekly/{date}/orders/{index}
│   ├── getSuggestionScorecard.js        # NEW — GET /api/analysis/scorecard
│   └── getWeeklyAnalysis.js             # include execution fields + proposedStatus + frozen
dashboard/src/pages/
├── analysis-detail.astro                # per-order status control + note + proposal + frozen badge
└── scorecard.astro                      # NEW — scorecard page (+ nav link)

tests/
├── unit/
│   ├── domain/entities/SuggestedOrder.test.js               # new-field validation
│   ├── domain/services/OrderExecutionMatcher.test.js        # NEW
│   └── application/use-cases/analysis/
│       ├── SetOrderExecutionStatus.test.js                  # NEW
│       ├── GetSuggestionScorecard.test.js                   # NEW
│       └── GenerateWeeklyAnalysis.test.js                   # + freeze-guard + prior-status assertions
└── integration/
    └── AzureAnalysisRepository.test.js                      # status round-trip + hasMarkedOrders
```

**Structure Decision**: Reuse the existing clean/DDD layout. The only new home is the pure
`OrderExecutionMatcher` in `src/domain/services/` (same place as feature 006's
`PositionChangeCalculator`). Everything else slots into existing folders, the `IAnalysisRepository`
interface, the DI container, and the established write-endpoint + dashboard-write conventions.

## Complexity Tracking

No constitution violations; no new dependencies or tables. Nothing to justify.

## Phase boundary

This plan ends at Phase 1 (design + contracts). Phase 2 (`tasks.md`) is produced by
`/speckit-tasks`. No code is written by `/speckit-plan`.
