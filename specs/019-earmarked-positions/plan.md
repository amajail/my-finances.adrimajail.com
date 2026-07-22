# Implementation Plan: Earmarked positions in the weekly analysis payload

**Branch**: `019-earmarked-positions` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-earmarked-positions/spec.md`

## Summary

Exclude positions held at owner-designated "earmarked" broker(s) from the weekly analysis's
allocation-drift, concentration-cap, and cross-broker duplicate-holdings computations, and
from the week-over-week position-change comparison (both prior and current sides) — while
still surfacing them as their own distinct, separately-labeled total. Earmarked-broker
designation is a comma-separated settings value (`analysis.earmarkedBrokers`, default
`'cash'`), so it can be changed or cleared without a deploy. Only positive-value positions at
an earmarked broker qualify; zero/negative-value positions there keep falling into the
existing administrative/non-investable bucket (feature 013) unchanged.

Technical approach: mirror the feature-013 pattern exactly. Inside `GenerateWeeklyAnalysis`,
partition the portfolio snapshot in order — earmarked (broker ∈ configured list AND
valueUsd > 0) computed *before* administrative (valueUsd ≤ 0) — so an earmarked position is
never miscategorized as a legacy stub. The remaining investable set (unchanged shape) feeds
`AllocationDriftCalculator`, `DuplicateHoldingsDetector`, and `PositionChangeCalculator`
exactly as today; none of those pure functions change. Carry `earmarkedPositions` through the
`WeeklyAnalysis` entity (new optional field, same shape as `administrativePositions`), the
Azure repository (new `earmarkedPositionsJson` column), and a new `## earmarkedPositions`
prompt block (omitted when empty, same convention as `administrativePositions`/`duplications`).
No dashboard or API-endpoint changes are in scope.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4)

**Primary Dependencies**: none new — reuses `@azure/data-tables` (existing repository), no new
npm packages

**Storage**: Azure Table Storage — existing `portfolioAnalysis` table; one new optional column
`earmarkedPositionsJson` on the analysis row (no new table). Existing `portfolioSettings` table
gains one new row key, `analysis.earmarkedBrokers` (no schema change — settings are free-form
key/value already)

**Testing**: Jest (unit). New tests mirroring
`tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.administrativePositions.test.js`
and its `WeeklyAnalysis`/`AzureAnalysisRepository` counterparts; no changes to existing
`AllocationDriftCalculator` / `DuplicateHoldingsDetector` / `PositionChangeCalculator` tests
(their pure math is untouched — only what set of positions is handed to them changes, at the
call site)

**Target Platform**: Azure Functions (backend only — no dashboard/UI in scope)

**Project Type**: Single backend project (existing clean-architecture layout)

**Performance Goals**: N/A — one extra in-memory partition step (array filter) per weekly run;
negligible

**Constraints**: No new external data source, table, or endpoint. Backward compatible:
pre-feature analysis rows load with no earmarked section, same as `administrativePositions`
handled pre-feature-013 rows (spec Edge Cases). No hardcoded real-world earmark purpose in
fixed code (spec FR-009) — generic wording only.

**Scale/Scope**: Single-user portfolio; typically 0–2 earmarked positions (a single reserve
broker). One run/week.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Privacy First (NON-NEGOTIABLE)**: PASS. No real holdings, broker names, or dollar
  amounts in code/tests/docs — tests use fake broker ids and placeholder symbols/values (e.g.
  `SYM_A`, `123.45`), following the existing `administrativePositions` test style. The
  earmarked-positions block flows to Anthropic at runtime only (already-authorized egress
  carve-out); not logged. No new log sink. Spec FR-009 additionally requires the fixed prompt
  wording stay generic (no named real-world purpose baked into code) — enforced by the
  prompt-block copy itself, verified by test assertion.
- **II. Clean Architecture / DDD**: PASS. Partitioning logic is inline in the use case
  (`GenerateWeeklyAnalysis`), exactly where the existing feature-013 partition already lives;
  no new domain service needed since it's a simple broker-membership + value-sign filter, not a
  reusable calculation. `AllocationDriftCalculator`, `DuplicateHoldingsDetector`, and
  `PositionChangeCalculator` remain pure and unchanged — only their *inputs* change at the call
  site. Entity change in `src/domain/entities/WeeklyAnalysis.js`; persistence in
  `AzureAnalysisRepository.js`. Function handlers untouched (no new/changed endpoints).
- **III. Idempotent Data Operations**: PASS. Re-running a week's analysis upserts (Replace),
  same as every other optional field on `WeeklyAnalysis`; an earmarked section present one run
  but empty on a re-run (e.g. broker designation cleared) is simply omitted, matching
  `administrativePositions`/`duplications` precedent. No seed-script change; the new setting is
  read via the existing settings GET/PUT endpoints, no new idempotent-seeder concern.
- **IV. Pragmatic Testing**: PASS. Adds unit tests for the partition ordering (earmarked before
  administrative), the drift/caps/duplications/position-change exclusion (business rule), the
  new prompt block, and entity/repository persistence round-trip including the failure path.
  No dashboard change to test (out of scope).
- **V. Convention-Driven Workflow**: PASS. Branch `019-earmarked-positions` = spec dir; SDD
  pipeline followed (specify → plan → tasks → implement; clarify skipped — spec had zero
  `[NEEDS CLARIFICATION]` markers, all quality-checklist items passed).

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/019-earmarked-positions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── prompt-additions.md # Phase 1 output — new `## earmarkedPositions` prompt block shape
├── checklists/
│   └── requirements.md   # Spec quality checklist (from /speckit-specify)
└── tasks.md               # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── application/use-cases/analysis/
│   └── GenerateWeeklyAnalysis.js
│       # 1. read setting `analysis.earmarkedBrokers` (default 'cash') via existing _getSetting
│       # 2. partition snapshot: earmarked (broker∈list, valueUsd>0) BEFORE administrative
│       #    (valueUsd<=0); everything else is investable, unchanged shape
│       # 3. feed only investable to AllocationDriftCalculator, DuplicateHoldingsDetector,
│       #    and PositionChangeCalculator (both current + prior snapshot sides)
│       # 4. add `## earmarkedPositions` prompt block (omit when empty) in _buildUserMessage
│       # 5. pass earmarkedPositions through to WeeklyAnalysis construction + _persistFailed
├── domain/entities/
│   └── WeeklyAnalysis.js
│       # new optional _earmarkedPositions field — same validate/getter/freeze/toJSON pattern
│       #   as _administrativePositions (array of objects, default [])
├── domain/services/
│   ├── AllocationDriftCalculator.js       # UNCHANGED (pure)
│   ├── DuplicateHoldingsDetector.js       # UNCHANGED (pure)
│   └── PositionChangeCalculator.js        # UNCHANGED (pure)
└── infrastructure/repositories/
    └── AzureAnalysisRepository.js         # write/read earmarkedPositionsJson column,
                                            #   mirroring administrativePositionsJson exactly

tests/unit/
├── application/use-cases/analysis/
│   └── GenerateWeeklyAnalysis.earmarkedPositions.test.js   # new — mirrors the .administrativePositions.test.js style
├── domain/entities/
│   └── WeeklyAnalysis.earmarkedPositions.test.js           # new — mirrors WeeklyAnalysis.administrativePositions.test.js
└── infrastructure/repositories/
    └── AzureAnalysisRepository.earmarkedPositions.test.js  # new — mirrors the administrativePositions repo test
```

**Structure Decision**: Existing clean-architecture layout, no new layers or files beyond the
mirrored test/entity/repository additions. The earmark partition is a filter step inline in the
use case (same placement and shape as the existing feature-013 administrative-position
partition) so every downstream pure domain service keeps operating on "the set of positions it
was handed," with zero changes to their internal logic — the simplest change that satisfies the
spec while touching only the orchestration layer and the persisted-entity shape.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
