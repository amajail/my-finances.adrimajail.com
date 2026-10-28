# Implementation Plan: Sustained Macro Triggers

**Branch**: `021-sustained-macro-triggers` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-sustained-macro-triggers/spec.md`

## Summary

Framework triggers such as "riesgo país > 800 bp sustained 30d" cannot be evaluated today: the model sees the current macro panel and the change since the prior run, never how long a condition has held. The plan computes that duration in code and hands it to the model next to the current reading:

1. A pure domain service, `SustainedTriggerEvaluator`, holds the three trigger definitions and turns the current macro panel plus prior analyses' `macroContext` into one result row per trigger: `heldDays`, `durationMet`, `status`, and flags for unknown weeks and limited history. Unusable weeks are skipped, never counted as breaks (research D3).
2. `GenerateWeeklyAnalysis` takes the history from one `getLatest` call, runs the evaluator right after the macro panel is captured, adds a `## sustainedTriggers` block after `## macroContext`, and stores the rows on the analysis.
3. One guardrail rule tells the model to report FIRED only when `durationMet` is true.
4. The rows persist as `sustainedTriggersJson` on the existing `portfolioAnalysis` row and are returned by the read API and MCP tool.
5. The BCRA trigger needs **net** reserves but the macro source only provides **gross** (research D6), so it reports `not-evaluable` instead of a misleading "not satisfied".

## Technical Context

**Language/Version**: Node.js 22 (Azure Functions v4 runtime, CommonJS), as the rest of the repo

**Primary Dependencies**: none new

**Storage**: Azure Table Storage only. One new JSON column on `portfolioAnalysis`; no new table (FR-012). Schemaless, so old rows read back as `null`.

**Testing**: Jest (`npm test`) and ESLint (`npm run lint`). Unit tests for the evaluator, use-case tests for wiring and failure handling, repository and function tests for persistence and the read path. Placeholder data only.

**Target Platform**: Azure Functions + Astro dashboard (existing); the dashboard is not changed

**Project Type**: web-service (Functions backend)

**Performance Goals**: no measurable change; the history read reuses `getLatest`, which already scans the single `weekly` partition (~52 rows per year)

**Constraints**: computation in code, not in the prompt (FR-003); provider-neutral model input, `ILLMClient` and the tool schema untouched (FR-013); a run with empty or unreadable history must still complete (FR-009); no real holdings in any tracked file

**Scale/Scope**: single user, one run per week, three triggers

## Constitution Check

*GATE: passes before Phase 0 and after Phase 1 (re-checked below).*

| Principle | Status | Note |
|---|---|---|
| I. Privacy First | PASS | The new block holds macro indicator values and thresholds only: no quantities, prices, PPC or account data. It goes to the already-authorized Anthropic call. Tests use fixed placeholder numbers. Trigger thresholds are macro rules, not holdings (research D7). |
| II. Clean Architecture / DDD | PASS | The evaluator is a pure domain service; the use case orchestrates; the repository gains a column mapping only; the Function adds one response field. |
| III. Idempotent Data Operations | PASS | Reads only analyses dated before the target, so a re-run of a date yields the same rows. The only write is the existing `upsert`. No position data touched. |
| IV. Pragmatic Testing | PASS | Tests target the logic that can silently go wrong: streak walking, thresholds, unknown handling, basis mismatch, first run. |
| V. Convention-Driven Workflow | PASS | Bare `021-sustained-macro-triggers` branch, conventional commit subjects. |

Post-design re-check: PASS. No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/021-sustained-macro-triggers/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── sustained-triggers.md
├── checklists/
│   └── requirements.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── entities/WeeklyAnalysis.js                       # + sustainedTriggers field (null default)
│   └── services/
│       ├── SustainedTriggerEvaluator.js                 # NEW: definitions + streak logic
│       └── index.js                                     # unchanged unless the barrel lists it
├── application/use-cases/analysis/
│   ├── GenerateWeeklyAnalysis.js                        # load history, evaluate, prompt block, persist
│   └── prompts/guardrail-preamble-v2.md                 # + rule 5
├── infrastructure/repositories/AzureAnalysisRepository.js  # sustainedTriggersJson read/write
└── functions/
    ├── getWeeklyAnalysis.js                             # + sustainedTriggers in body
    └── mcp.js                                           # + sustainedTriggers in get_weekly_analysis body

tests/unit/
├── domain/services/SustainedTriggerEvaluator.test.js                                   # NEW
├── application/use-cases/analysis/GenerateWeeklyAnalysis.sustainedTriggers.test.js     # NEW
├── infrastructure/repositories/AzureAnalysisRepository.sustainedTriggers.test.js       # NEW
├── functions/mcp.test.js                                                               # extended
└── (integration) tests/integration/functions/getWeeklyAnalysis.test.js                 # extended
```

**Structure Decision**: Single backend project, following the layout feature 020 used. The dashboard is out of scope per the spec, so `dashboard/` is untouched.

## Design Notes

- **Evaluator input**: `{ currentMacro, priorAnalyses }` where each prior is `{ date, status, macroContext }`; output is an array in definition order. It never throws on malformed input.
- **Use-case placement**: directly after step 4b (`MacroChangeCalculator.diff`), so the failure-path persistence can carry the rows. History loading is a small private method with the same try/catch shape as `_loadPriorWeeksForOrders`.
- **Prompt block**: built in `_buildUserMessage` from the rows, one compact JSON array, right after the `## macroContext` section so the held-days figure is adjacent to the reading (contract §1).
- **Guardrail**: appended as rule 5 in `guardrail-preamble-v2.md`, edited in place as feature 020 did for rule 4.
- **Out of scope** (per spec): dashboard rendering, backfilling past analyses, a net-reserves data source, moving trigger definitions into settings.

## Complexity Tracking

None.
