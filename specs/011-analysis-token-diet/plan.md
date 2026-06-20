# Implementation Plan: Analysis Token Diet

**Branch**: `011-analysis-token-diet` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-analysis-token-diet/spec.md`

## Summary

Cut per-run tokens/cost of the weekly analysis without losing analytical content, via small code changes plus owner-facing guidance. Output is ~5× the price of input on the current model, and feature 010 moved the tabular detail into structured tables, so the prose narrative can shrink safely.

- **Input trim** (in `_buildUserMessage`): compact JSON instead of pretty-printed; drop the redundant `portfolioTotals` block (keep a one-line MEP rate); strip `topPerformers`/`bottomPerformers` from the prompt summary (derivable from holdings, documented revert).
- **Output trim**: add a concision directive to the fixed **guardrail preamble** — the only code-controlled part of the runtime system prompt, since the editable `analysis.instructionsV1` body is what's actually used (the seed template `weekly-rebalance-v1.md` is inert at runtime) — and tighten the suggested-order `rationale` cap (1000 → 400).
- **Owner levers** (docs, no code): how the editable instructions size drives cost and how to trim it; the `analysis.model` cheaper-tier tradeoff. Default model unchanged (Opus retained).

Target: directional ~25% fewer total tokens (both sides down), all six tables still produced, no hard narrative cap.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4 backend); Astro dashboard (only the feature-010 editing guide text is touched, no UI logic).

**Primary Dependencies**: `@anthropic-ai/sdk` (the priced call), `@azure/data-tables`. **No new dependencies.**

**Storage**: No schema/table changes. Telemetry (`tokensIn`/`tokensOut`/`costUsd`) already persisted per `WeeklyAnalysis` — reused as the measurement basis.

**Testing**: Jest. Update the existing `GenerateWeeklyAnalysis` prompt-assembly tests to the trimmed payload; add assertions for the removed blocks and the preamble concision line.

**Target Platform**: Azure Functions (analysis runs via `weeklyAnalysisTimer`).

**Project Type**: Web app (backend `src/` + Astro `dashboard/`).

**Performance Goals**: Reduce tokens ~25% directional (SC-001); both input and output down (SC-002); zero truncation-induced failures (SC-005).

**Constraints**: Keep all six structured sections (FR-005); no hard `markdownBody` cap (FR-008); default model stays Opus (FR-009); persisted record + dashboard unchanged (FR-011).

**Scale/Scope**: Single user, ~52 runs/year. A handful of files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Privacy First (NON-NEGOTIABLE) | ✅ Pass | The change *reduces* data sent to the third-party model; no new egress; the prompt/response are still never logged (telemetry-only). Preamble + guide remain generic/holdings-free. |
| II. Clean Architecture / DDD | ✅ Pass | Edits are localized: prompt assembly in the use case, the committed preamble file, and the tool-schema contract. No business rules moved into handlers. |
| III. Idempotent Data Operations | ✅ Pass | No seeders or data writes changed. |
| IV. Pragmatic Testing | ✅ Pass | Use-case prompt-assembly tests updated; this is exactly where a silent regression would hurt. |
| V. Convention-Driven Workflow | ✅ Pass | Branch `011-analysis-token-diet` (bare `NNN-kebab`, constitution v1.1.1). |

No violations. No new dependencies to justify.

## Project Structure

### Documentation (this feature)

```text
specs/011-analysis-token-diet/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (what to trim, why, measurement)
├── data-model.md        # Phase 1 — model-input payload shape after trim; telemetry basis
├── quickstart.md        # Phase 1 — before/after measurement + owner levers + revert
├── contracts/
│   └── tool-schema-change.md   # the submit_analysis rationale-cap change
├── spec.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/application/use-cases/analysis/
├── GenerateWeeklyAnalysis.js          # _buildUserMessage: compact JSON; drop portfolioTotals block
│                                       #   (+ mepRate line); strip top/bottomPerformers from summaryForPrompt
└── prompts/
    ├── guardrail-preamble-v1.md       # + concision directive (runtime-effective output lever)
    └── editing-guide-v1.md            # + owner cost-lever guidance (shown in the /instructions editor)

specs/002-weekly-rebalance-analysis/contracts/
└── submit-analysis-tool.json          # orders[].rationale maxLength 1000 → 400

tests/unit/application/use-cases/analysis/
├── GenerateWeeklyAnalysis.test.js     # update prompt-assembly assertions; add removed-block assertions
└── GenerateWeeklyAnalysis.instructionsLink.test.js  # preamble now carries concision line (already preamble⊕body)
```

**Structure Decision**: Pure modification of existing feature-002/005/010 code paths. The notable design choice is *where each lever lives*: the **guardrail preamble** (committed, prepended every run) is the only code-owned way to influence narrative length, and the **editing guide** (already surfaced read-only in the dashboard by feature 010) is the natural home for owner-facing cost guidance — so FR-010 documentation is visible exactly where the owner edits.

## Key facts that shape the approach

- **The seed template is inert at runtime.** `GenerateWeeklyAnalysis` only `require`s the tool schema (`GenerateWeeklyAnalysis.js:35`); the system prompt is `buildSystemPrompt(activeInstructionsBody)` = preamble ⊕ DB body. So editing `weekly-rebalance-v1.md` does NOT change runtime output — the **preamble** and the **tool schema** are the only code levers; the body is owner-only (→ docs).
- **Output dominates cost** (~$75 vs $15 / 1M). The concision directive + rationale cap target the expensive side; the input trims are cheaper-per-token but easy and safe.
- **Persistence/display untouched** (FR-011): `portfolioTotals` is still computed and stored on the `WeeklyAnalysis` and shown on the dashboard — only its *prompt block* is removed. `PortfolioCalculator.summary()` is unchanged (the dashboard uses it); performers are stripped only from the prompt copy in `_buildUserMessage`.

## Complexity Tracking

No constitution violations; no new dependencies; no new entities or storage. Nothing to justify.

## Phase notes

- **Phase 0 (research.md):** confirms each trim is safe and lists the measurement method (reuse persisted telemetry; compare against the captured 2026-06-13 baseline of 21,729 in / 7,962 out, accepting week-to-week variance per the directional target).
- **Phase 1 (data-model.md, contracts/, quickstart.md):** documents the trimmed payload shape, the one tool-schema change, and the before/after + owner-lever + revert steps. No new contracts beyond the schema tweak.
