# Implementation Plan: Weekly analysis token-diet v2

**Branch**: `015-analysis-token-diet-v2` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-analysis-token-diet-v2/spec.md`

## Summary

Reduce per-run cost of the weekly analysis beyond feature 011, focusing on the cost-dominant
**output** and on input that is now redundant given deterministic sections. Three levers, no
schema/data changes: (1) strengthen the fixed guardrail preamble so the narrative interprets —
not reproduces — the deterministically computed tables (drift, caps, position changes, macro
week-over-week, duplications); (2) drop the redundant prior-macro panel from the
`## previousAnalysis` input block (its information is already in the deterministic macro
week-over-week comparison from feature 012); (3) omit unavailable indicators from the
`## macroContext` input block instead of sending empty placeholders. Verified by A/B on identical
captured inputs using existing token/cost telemetry.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4)

**Primary Dependencies**: `@anthropic-ai/sdk` (unchanged); no new deps

**Storage**: No change — no schema, table, or persisted-field change

**Testing**: Jest (unit) for the input-assembly trims (previousAnalysis without prior-macro;
macroContext omits unavailable). Output behaviour (interpret-not-restate) is preamble guidance,
verified by the A/B run + manual content check (no required section dropped)

**Target Platform**: Azure Functions (backend)

**Project Type**: Web application (backend-only change; dashboard unchanged)

**Performance Goals**: Lower output tokens/cost per run; directional ≥15% output reduction target

**Constraints**: No required narrative section may be dropped (hard gate, spec FR-002/SC-003);
default model unchanged (FR-007); savings measured by A/B on identical inputs (clarify 2026-06-21)

**Scale/Scope**: One run/week; change is localized to prompt assembly + the fixed preamble text

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Privacy First (NON-NEGOTIABLE)**: PASS. No real holdings in code/tests/docs; tests use fake
  data. Change only trims what is sent to the already-authorized Anthropic egress; nothing newly
  logged.
- **II. Clean Architecture / DDD**: PASS. Changes are confined to the analysis use case's input
  assembly (`_buildUserMessage`) and the static preamble asset; no domain or handler changes.
- **III. Idempotent Data Operations**: PASS. No persistence change; re-runs behave as before.
- **IV. Pragmatic Testing**: PASS. Unit tests for the two input trims (business-relevant assembly
  logic). Output-length guidance is verified by A/B, not a brittle length assertion.
- **V. Convention-Driven Workflow**: PASS. Branch = spec dir; SDD pipeline followed.

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/015-analysis-token-diet-v2/
├── plan.md
├── research.md
├── data-model.md          # minimal — no entity change (records "no data model change")
├── quickstart.md
├── contracts/
│   └── prompt-changes.md  # describes input-block + preamble changes (no API change)
├── checklists/requirements.md
└── tasks.md               # /speckit-tasks output (later)
```

### Source Code (repository root)

```text
src/
├── application/use-cases/analysis/
│   └── GenerateWeeklyAnalysis.js   # _buildUserMessage: drop prior-macro panel from
│                                   #   `## previousAnalysis`; omit unavailable indicators
│                                   #   from `## macroContext`
└── <prompt assets>/
    └── guardrail-preamble-v1.md    # strengthen "interpret, don't restate the supplied tables";
                                    #   the ONLY code-controlled part of the runtime system prompt

tests/unit/
└── application/.../GenerateWeeklyAnalysis(.input)test.js  # assert trims; continuity preserved
```

**Structure Decision**: Existing layout. Output savings come from the fixed preamble (applied every
run, independent of the owner-editable instructions body); input savings from `_buildUserMessage`.
No new modules.

## Dependency / sequencing note

Levers (1) and (2) lean on the deterministic sections being present: the macro week-over-week
comparison (feature 012) makes the prior-macro panel redundant, and the duplicates/admin sections
(features 014/013) are among the tables the narrative should stop restating. Best implemented after
012 (and ideally 013/014) merge so the "interpret not restate" instruction references sections that
actually exist on `main`. Where a deterministic section is absent, the corresponding trim degrades
to a no-op (spec edge cases). Sequencing only — no shared spec dependency.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
