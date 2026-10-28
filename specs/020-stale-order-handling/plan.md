# Implementation Plan: Stale and Unrecorded Order Handling

**Branch**: `020-stale-order-handling` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-stale-order-handling/spec.md`

## Summary

The weekly analysis re-issues the same pending order for weeks because (a) it only sees the single previous week's orders, with no age, and (b) the prompt rule "do not silently repeat" is advice, not enforcement. The plan makes the guarantee deterministic and keeps the model out of the loop where it can fail:

1. A pure domain service, `PendingOrderTracker`, builds per-order "chains" (same broker + symbol + side, pending, in consecutive completed analyses) with an age in weeks, from the last 8 completed analyses and their stored position changes.
2. `GenerateWeeklyAnalysis` injects the chains into the model input (`## pendingOrders`), then post-filters the model's `orders[]` in code: orders matching a stale chain (age > threshold) or a probable-fill chain are removed and recorded as confirmation items; orders matching a younger chain are stamped with `ageWeeks` (carry-over label).
3. `OrderExecutionMatcher` gains a multi-week mode with greedy consumption so one position change satisfies at most one order; the read path and the tracker both use it. Proposals stay display-only.
4. The API/MCP expose `ageWeeks` on orders and a `confirmationItems` list on the analysis. The dashboard renders the list as a panel.

## Technical Context

**Language/Version**: Node.js (Azure Functions v4 runtime, CommonJS), same as the rest of the repo

**Primary Dependencies**: none new (`@azure/data-tables`, `@anthropic-ai/sdk` already present)

**Storage**: Azure Table Storage only. Optional new columns, no new table: `ageWeeks` on `portfolioOrders` rows; `confirmationItemsJson` on `portfolioAnalysis` rows. Schemaless, so old rows read back as absent/null.

**Testing**: Jest (`npm test`); unit tests for the new domain service and matcher extension, use-case tests for the filter/stamp behaviour, function test for the read path. Placeholder data only.

**Target Platform**: Azure Functions + Astro dashboard (existing)

**Project Type**: web-service (Functions backend + `dashboard/` frontend)

**Performance Goals**: no measurable change; one extra bounded read of at most 8 analyses (partition-key reads) per weekly run

**Constraints**: weekly run must still work with zero prior orders (FR-011); a re-run of a date must be idempotent (chain built only from dates strictly before the target); no real holdings in any tracked file (FR-012)

**Scale/Scope**: single user, ~1 analysis per week, 0 to a handful of orders per analysis

## Constitution Check

*GATE: passes before Phase 0 and after Phase 1 (re-checked below).*

| Principle | Status | Note |
|---|---|---|
| I. Privacy First | PASS | Tests and fixtures use `SYMBOL`/`BROKER` placeholders. No new egress: the added `pendingOrders` block goes to the already-authorized Anthropic call and carries no more than `previousAnalysis.orders` already does. |
| II. Clean Architecture / DDD | PASS | Tracker and matcher are pure domain services; filtering orchestration is in the use case; the Function stays thin (parse, use case, respond). |
| III. Idempotent Data Operations | PASS | No writes outside the existing `upsert` of an analysis. Chain computation reads only dates before the target, so re-runs give the same result. No change to position data. |
| IV. Pragmatic Testing | PASS | Tests target the logic that can silently go wrong (aging, double-count, filter). |
| V. Convention-Driven Workflow | PASS | Bare `020-stale-order-handling` branch; conventional commit subjects. |

Post-design re-check: PASS. No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/020-stale-order-handling/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── weekly-analysis-api.md
└── tasks.md             # produced by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── entities/
│   │   └── SuggestedOrder.js            # + optional ageWeeks (integer, default 0)
│   └── services/
│       ├── OrderExecutionMatcher.js     # + proposeAcrossWeeks (greedy, no double count)
│       ├── PendingOrderTracker.js       # NEW: chains, ageWeeks, stale/probable-fill split
│       └── index.js                     # export the new service
├── application/
│   └── use-cases/analysis/
│       ├── GenerateWeeklyAnalysis.js    # load 8 weeks, inject block, filter + stamp
│       └── prompts/weekly-rebalance-v1.md   # document the pendingOrders block
├── infrastructure/repositories/
│   └── AzureAnalysisRepository.js       # persist ageWeeks, confirmationItemsJson
├── domain/entities/WeeklyAnalysis.js    # + optional confirmationItems
└── functions/
    ├── getWeeklyAnalysis.js             # ageWeeks, confirmationItems, multi-week proposals
    └── mcp.js                           # same fields in get_weekly_analysis

dashboard/                               # confirmation-items panel on the analysis page

tests/unit/
├── domain/services/                     # PendingOrderTracker, OrderExecutionMatcher
├── application/use-cases/               # GenerateWeeklyAnalysis filter/stamp
└── functions/                           # getWeeklyAnalysis read path
```

**Structure Decision**: extend the existing clean-architecture layout; one new domain service, no new use case or table. The staleness threshold is a single exported constant (`STALE_AFTER_WEEKS = 3`) owned by `PendingOrderTracker` and referenced by the use case and prompt builder, never repeated in prompt prose (FR-006).

## Complexity Tracking

No constitution violations to justify.
