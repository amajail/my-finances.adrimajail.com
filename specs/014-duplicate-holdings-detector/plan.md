# Implementation Plan: Cross-broker duplicate-holdings detector

**Branch**: `014-duplicate-holdings-detector` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-duplicate-holdings-detector/spec.md`

## Summary

Add a deterministic, code-computed "duplicate holdings" section to the weekly analysis: detect
every underlying instrument held in 2+ distinct placements, where a placement is a
`(broker, assetType)` pair and underlyings are matched by shared `symbol`. Mirrors the existing
feature-006 `PositionChangeCalculator` / feature-012 `MacroChangeCalculator` pattern.

Technical approach: a NEW pure domain service `src/domain/services/DuplicateHoldingsDetector.js`
with a stateless `detect(snapshot)` that groups the (investable) snapshot by `symbol`, keeps
groups with ≥ 2 distinct `(broker, assetType)` placements, excludes cash/cash-equivalents, and
returns groups sorted by combined value desc (or `[]`). Wire it through `GenerateWeeklyAnalysis`
(compute + prompt block), `WeeklyAnalysis` (optional `duplications` field), `AzureAnalysisRepository`
(`duplicationsJson` column), the detail API response, and a "Duplicate holdings" table on
`analysis-detail.astro` — exactly like the macroChanges section.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4), Astro (dashboard)

**Primary Dependencies**: `@azure/data-tables`, `@anthropic-ai/sdk` (unchanged); no new deps

**Storage**: Azure Table Storage — existing `portfolioAnalysis` table; one new optional column
`duplicationsJson` (no new table)

**Testing**: Jest (unit). New `DuplicateHoldingsDetector.test.js` mirroring
`PositionChangeCalculator.test.js`

**Target Platform**: Azure Functions (backend) + Azure Static Web Apps (dashboard)

**Project Type**: Web application (Functions backend + Astro frontend)

**Performance Goals**: N/A — one in-memory group-by per weekly run

**Constraints**: Deterministic (same input → same groups + order); stateless (current portfolio
only, no prior dependency — works on first run); no new data source/table/model change (FR-014)

**Scale/Scope**: Single-user portfolio, tens of positions, one run/week

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Privacy First (NON-NEGOTIABLE)**: PASS. Tests use fake symbols/values; no real holdings in
  code/docs. Duplicates block flows to Anthropic at runtime only (authorized egress), not logged.
- **II. Clean Architecture / DDD**: PASS. Detection is a pure domain service in
  `src/domain/services/`; the use case orchestrates; entity + repository carry the result. Handlers
  untouched. Same layering as `PositionChangeCalculator` / `MacroChangeCalculator`.
- **III. Idempotent Data Operations**: PASS. Recomputed each run; re-run upserts (Replace); a group
  present once but absent on re-run is dropped (FR-009). No seed change.
- **IV. Pragmatic Testing**: PASS. New unit tests for the detector (business rule). Dashboard render
  exempt.
- **V. Convention-Driven Workflow**: PASS. Branch = spec dir; SDD pipeline followed.

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/014-duplicate-holdings-detector/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api-additions.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks output (later)
```

### Source Code (repository root)

```text
src/
├── domain/services/
│   └── DuplicateHoldingsDetector.js   # NEW pure service: detect(snapshot) -> group[] | []
├── application/use-cases/analysis/
│   └── GenerateWeeklyAnalysis.js       # compute duplications next to positionChanges/macroChanges;
│                                       #   add `## duplications` prompt block; pass to entity + captured
├── domain/entities/
│   └── WeeklyAnalysis.js               # new optional _duplications field (validate/getter/freeze/toJSON)
└── infrastructure/repositories/
    └── AzureAnalysisRepository.js       # write/read duplicationsJson column

dashboard/src/pages/
└── analysis-detail.astro               # render "Duplicate holdings" table (omit when empty)

tests/unit/domain/services/
└── DuplicateHoldingsDetector.test.js   # NEW — mirrors PositionChangeCalculator.test.js
```

**Structure Decision**: Existing clean-architecture layout. New detector mirrors the established
pure-service pattern (feature 006/012) so wiring, persistence, and rendering all follow proven paths.

## Dependency / sequencing note

Implementation wiring mirrors feature 012's `macroChanges` (currently on branch
`012-macro-week-over-week`, not yet merged). This feature is best implemented after 012 merges so
the entity/repository/dashboard patterns it copies are present on `main`. The detector itself and
its unit tests are independent of 012 and can be built/tested first. (Sequencing only — no shared
spec dependency.)

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
