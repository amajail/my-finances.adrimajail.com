# Implementation Plan: Structured Analysis Tables

**Branch**: `010-structured-analysis-tables` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-structured-analysis-tables/spec.md`

## Summary

Surface the weekly rebalance analysis's still-prose sections as first-class structured UI, split by source per the clarified hybrid design:

- **Code-computed (deterministic):** bucket drift, asset-class drift, concentration caps — derived from the live portfolio summary + a new **machine-readable allocation-targets** artifact (none exists today; targets live only in the prose framework). A new pure calculator produces the rows; they are persisted on the analysis and rendered as tables.
- **LLM-emitted (judgment):** watchlist, week-over-week analytical deltas, framework-amendment suggestions — captured by extending the `submit_analysis` tool schema with optional structured arrays, persisted as JSON columns, and rendered as tables.
- **Instruction safety:** a fixed, committed **guardrail preamble** is prepended to the owner-edited instructions body at prompt-assembly time (effective prompt = `preamble ⊕ body`), shown read-only in the editor alongside a short editing guide. The preamble forbids inventing figures and recomputing the code-owned tables, which also backs the narrative de-duplication (FR-009).

Zero new runtime dependencies; reuses the feature-006 JSON-column persistence pattern and the feature-006/008 hand-rolled rendering approach.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4 backend); Astro (static dashboard), vanilla JS in page `<script>` islands.

**Primary Dependencies**: `@azure/data-tables` (storage), `@anthropic-ai/sdk` (analysis LLM), `marked` + `dompurify` (existing narrative render). **No new dependencies.**

**Storage**: Azure Table Storage. Reuses `portfolioAnalysis` (new optional JSON columns) and `portfolioSettings` (new `analysis.allocationTargetsV1` row). No new tables.

**Testing**: Jest (backend). New pure calculator + entity validation + repository round-trip get unit tests (Principle IV). Astro page render is exempt (visual UI).

**Target Platform**: Azure Functions (API) + Azure Static Web Apps (dashboard).

**Project Type**: Web application (backend `src/` + frontend `dashboard/`).

**Performance Goals**: N/A in the usual sense — single-user, weekly cadence. The calculator runs once per analysis over ~dozens of positions; trivial cost. No added LLM tokens beyond the new optional tool-schema fields.

**Constraints**: Privacy First (NON-NEGOTIABLE) — real allocation targets, caps, and holdings stay out of source control; only a placeholder template is committed. The preamble + editing guide are generic/holdings-free and committable.

**Scale/Scope**: ~52 analyses/year, single partition. Targets artifact is a handful of buckets/classes/caps.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Privacy First (NON-NEGOTIABLE) | ✅ Pass | Real targets/caps live in `analysis.allocationTargetsV1` (runtime settings, never committed); only `scripts/allocation-targets.example.json` placeholder is committed, mirroring the existing framework-seed pattern. Preamble + guide are generic. No holdings reach logs (existing sanitization unchanged). |
| II. Clean Architecture / DDD | ✅ Pass | New `AllocationDriftCalculator` (pure, `src/application` or `src/domain`); targets read via a repository interface; functions stay thin; rendering stays in the Astro page. |
| III. Idempotent Data Operations | ✅ Pass | `seed-allocation-targets.js` is skip-if-present (insert-only), matching the framework seeder. |
| IV. Pragmatic Testing | ✅ Pass | Calculator, entity validation, and repo mappers get unit tests; UI exempt. |
| V. Convention-Driven Workflow | ⚠️ Deviation (documented) | Branch is `010-structured-analysis-tables` (bare `NNN-kebab`), not `feature/{kebab}`. This follows the owner's 2026-06-13 decision to use the Spec Kit format for spec'd features; the constitution's Principle V still says `feature/`. See Complexity Tracking — recommend a `/speckit-constitution` PATCH amendment to reconcile. Not blocking. |

No unjustified violations. The single deviation (branch naming) is intentional and tracked.

## Project Structure

### Documentation (this feature)

```text
specs/010-structured-analysis-tables/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (targets source, preamble, trim, persistence)
├── data-model.md        # Phase 1 — entity fields, targets schema, row shapes
├── quickstart.md        # Phase 1 — seed targets, verify tables + preamble locally
├── contracts/           # Phase 1 — tool-schema additions, targets schema, API response deltas
│   ├── submit-analysis-additions.md
│   ├── allocation-targets.schema.json
│   └── api-additions.md
├── spec.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
src/
├── domain/entities/
│   └── WeeklyAnalysis.js                      # + optional structured fields (driftByBucket, driftByAssetClass,
│                                              #   concentrationCaps, watchlist, weekOverWeek, frameworkAmendments)
├── application/
│   ├── interfaces/
│   │   └── IAllocationTargetsRepository.js    # NEW — read the machine-readable targets
│   └── use-cases/analysis/
│       ├── GenerateWeeklyAnalysis.js          # prepend guardrail preamble; compute drift/caps; pass LLM arrays through
│       ├── AllocationDriftCalculator.js       # NEW — pure: positions + targets → drift/cap rows
│       └── prompts/
│           ├── weekly-rebalance-v1.md         # trim the now-tabular sections from required markdown (FR-009)
│           ├── guardrail-preamble-v1.md       # NEW — fixed, committed, generic preamble text
│           └── submit-analysis-tool.json      # extend with optional watchlist/weekOverWeek/frameworkAmendments
├── infrastructure/repositories/
│   ├── AzureAnalysisRepository.js             # + JSON columns for the six structured sections (feature-006 pattern)
│   └── AzureAllocationTargetsRepository.js    # NEW — read analysis.allocationTargetsV1 settings row
└── functions/
    └── instructions.js                         # GET /api/instructions response gains read-only `preamble` + `editingGuide`

scripts/
├── allocation-targets.example.json            # NEW — committed placeholder schema (privacy-safe)
└── seed-allocation-targets.js                  # NEW — idempotent seeder for analysis.allocationTargetsV1

dashboard/src/pages/
├── analysis-detail.astro                       # + sections/render fns for the six structured tables
└── instructions.astro                          # read-only preamble block + collapsible editing guide

tests/ (Jest)                                   # AllocationDriftCalculator, WeeklyAnalysis validation, repo round-trip
```

**Structure Decision**: Existing web-app layout (clean/DDD backend in `src/`, Astro dashboard in `dashboard/`). The one genuinely new architectural element is the machine-readable allocation-targets artifact + its repository and the pure `AllocationDriftCalculator`; everything else extends established patterns (feature-006 JSON columns, feature-006/008 hand-rolled rendering, feature-005 instructions plumbing).

## Build order (maps to spec user-story priorities)

1. **Foundation:** allocation-targets schema + seeder + repository interface/impl; `AllocationDriftCalculator` (drift only) + tests. Persist + render bucket/asset-class drift → **US1 (P1) MVP**.
2. **Caps + risk (US2, P2):** extend calculator with concentration caps; extend tool schema with `watchlist`; persist + render both.
3. **Instruction safety (US2/US4, P2):** guardrail preamble file + prompt-assembly prepend; `GET /api/instructions` preamble + editing guide; editor read-only block + guide; trim base prompt template (FR-009).
4. **Longitudinal (US3, P3):** `weekOverWeek` + `frameworkAmendments` tool-schema fields; persist + render.

Each step is independently shippable and degrades gracefully on pre-feature rows.

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| New `analysis.allocationTargetsV1` settings artifact + repository | The hybrid clarification (Q1) requires deterministic, code-computed drift/caps, which need machine-readable targets; today targets exist only as prose in `analysis.strategicFrameworkV1`. | Parsing the prose framework is brittle and would silently miscalculate (the exact "misleading numbers" risk the owner flagged). LLM-emitting the targets defeats the determinism the hybrid was chosen for. |
| `AllocationDriftCalculator` (new use-case/domain unit) | Encapsulates membership assignment + weight/drift/cap math as a pure, unit-tested unit (Principle II/IV). | Inlining the math in `GenerateWeeklyAnalysis` would make it untestable and bury financial arithmetic in an orchestrator. |
| Guardrail preamble prepended outside the editable body (FR-014) | Gives a non-editable safety harness the owner cannot break, and a transparent read-only view. | Storing the preamble inside the editable instructions row (feature-005 model) would let an edit remove the guardrails — the failure mode this story exists to prevent. |
| Branch naming deviates from Principle V | Owner's 2026-06-13 decision: spec'd features use the bare `NNN-kebab` Spec Kit format (= spec dir). | Keeping `feature/` would diverge from how 006–009 already branched and from the spec-dir name. Recommend reconciling Principle V via `/speckit-constitution`. |

## Phase notes

- **Phase 0 (research.md):** resolves the one real unknown — how machine-readable targets are sourced and how buckets map to holdings — plus preamble storage/assembly, narrative-trim mechanism, and confirms the feature-006 persistence/render patterns apply. No `NEEDS CLARIFICATION` remain after the `/speckit-clarify` session.
- **Phase 1 (data-model.md, contracts/, quickstart.md):** entity field additions, the targets JSON schema, the six row shapes, the `submit_analysis` extension (LLM sections only), API response deltas, and local verification steps.
