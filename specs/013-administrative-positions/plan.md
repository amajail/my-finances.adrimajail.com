# Implementation Plan: Administrative / non-investable positions

**Branch**: `013-administrative-positions` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-administrative-positions/spec.md`

## Summary

Exclude held positions whose computed USD value is ≤ 0 (zero or negative — legacy/tokenized
stubs with no recoverable price) from the weekly analysis's allocation-drift and
concentration-cap computations, and surface them in a separate, optional "administrative /
non-investable" section that is persisted with the analysis, rendered as its own table on the
analysis detail page, and sent to the model as a compact labeled "do not flag" block.

Technical approach: partition the existing portfolio snapshot once inside
`GenerateWeeklyAnalysis` into `investableSnapshot` (valueUsd > 0) and `administrativePositions`
(valueUsd ≤ 0). Feed only the investable set to the existing `AllocationDriftCalculator` and to
`PositionChangeCalculator`; the drift calculator stays a pure function (no change to its math).
Carry `administrativePositions` through the `WeeklyAnalysis` entity (new optional field), the
Azure repository (new `administrativePositionsJson` column), the detail API response, and the
dashboard — mirroring the established feature-006/010 optional-section pattern.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4), Astro (dashboard)

**Primary Dependencies**: `@azure/data-tables`, `@anthropic-ai/sdk` (unchanged); no new deps

**Storage**: Azure Table Storage — existing `portfolioAnalysis` table; one new optional column
`administrativePositionsJson` on the analysis row (no new table)

**Testing**: Jest (unit). New/extended unit tests for the partition behaviour and drift
exclusion; existing `AllocationDriftCalculator` math unchanged

**Target Platform**: Azure Functions (backend) + Azure Static Web Apps (dashboard)

**Project Type**: Web application (Functions backend + Astro frontend)

**Performance Goals**: N/A — one extra in-memory array filter per weekly run; negligible

**Constraints**: No new external data source, table, or model change (spec FR-011). Backward
compatible: pre-feature analysis rows load with no administrative section (FR-008)

**Scale/Scope**: Single-user portfolio; tens of positions per run. One run/week

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Privacy First (NON-NEGOTIABLE)**: PASS. No real holdings in code/tests/docs — tests use
  fake symbols/values (e.g. `STUB`, `FUNDX`, `123.45`). The administrative block flows to Anthropic
  at runtime only (already-authorized egress carve-out); not logged. No new log sink.
- **II. Clean Architecture / DDD**: PASS. Classification logic is a small pure helper; drift stays
  in `src/domain/services/`; the use case `GenerateWeeklyAnalysis` orchestrates; entity changes in
  `src/domain/entities/WeeklyAnalysis.js`; persistence in the repository implementation. Function
  handlers untouched.
- **III. Idempotent Data Operations**: PASS. Re-running a week's analysis upserts (Replace); an
  administrative section present one run but empty on a re-run is dropped (FR-007). No seed change.
- **IV. Pragmatic Testing**: PASS. Adds unit tests for the partition + drift-exclusion (business
  rule). Dashboard render is exempt visual UI.
- **V. Convention-Driven Workflow**: PASS. Branch `013-administrative-positions` = spec dir; SDD
  pipeline followed (specify → clarify → plan → tasks → analyze → implement).

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/013-administrative-positions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api-additions.md # Phase 1 output — analysis-detail response shape addition
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── application/use-cases/analysis/
│   └── GenerateWeeklyAnalysis.js     # partition snapshot; feed investable to drift/caps/changes;
│                                     #   add `## administrativePositions` prompt block; pass field
├── domain/entities/
│   └── WeeklyAnalysis.js             # new optional _administrativePositions field (+validate/getter/freeze/toJSON)
├── domain/services/
│   └── AllocationDriftCalculator.js  # UNCHANGED (pure); exclusion happens upstream in the use case
└── infrastructure/repositories/
    └── AzureAnalysisRepository.js     # write/read administrativePositionsJson column

dashboard/src/pages/
└── analysis-detail.astro             # render "Administrative / non-investable" table (omit when empty)

tests/unit/
├── application/ (or domain/) ...      # new test: snapshot partition + drift excludes valueUsd<=0
└── domain/services/AllocationDriftCalculator.test.js  # assert no stub-driven 'unclassified' row
```

**Structure Decision**: Existing clean-architecture layout. The classification (`valueUsd <= 0`)
lives in the use case as a partition step so `AllocationDriftCalculator` remains a pure function
operating on whatever set it is handed — the simplest change that keeps the domain service free of
the new concept and changes zero drift math for value-bearing holdings.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
