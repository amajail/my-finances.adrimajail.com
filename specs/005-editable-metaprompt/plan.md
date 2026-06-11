# Implementation Plan: Editable Analysis Metaprompt

**Branch**: `005-editable-metaprompt` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-editable-metaprompt/spec.md`

## Summary

Collapse the two-part weekly-analysis instructions — a committed fixed template
(`weekly-rebalance-v1.md` with a single `{{strategicFramework}}` slot) plus the
owner-authored strategic framework injected at that slot — into **one fully
editable "Instructions" document** the owner controls end to end from the
dashboard. The merged document is used **verbatim** as the AI's system prompt
(no token substitution); live portfolio/market data continues to be delivered
separately in the user message and is unchanged.

Technical approach: reuse feature 004's proven append-only history + restore +
no-op + snapshot-at-start model, refactored/renamed from "Framework" to
"Instructions". Stand up **new storage** (a `portfolioInstructionsHistory`
table and a new `analysis.instructionsV1` settings key) so history starts fresh
per FR-020 without a destructive migration of 004's data. `GenerateWeeklyAnalysis`
stops loading a versioned template file and stops substituting `{{strategicFramework}}`;
it reads the active instructions document and uses it directly. The
`analysis.promptVersion` template-selection concept is retired (FR-019). A
one-off, privacy-safe seed step renders the committed base template ⊕ the live
active framework into exactly one initial instructions version (FR-015, SC-004),
generated at migration time from runtime settings — never committed.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4); Astro (dashboard).

**Primary Dependencies**: `@azure/data-tables`, `@anthropic-ai/sdk` (existing,
unchanged). No new runtime dependencies.

**Storage**: Azure Table Storage. New table `portfolioInstructionsHistory`
(append-only); new `portfolioSettings` row `analysis.instructionsV1` (active
document + metadata). Existing `portfolioAnalysis` rows gain one optional
property. 004's `portfolioFrameworkHistory` table and `analysis.strategicFrameworkV1`
row are left in place (orphaned, non-destructive) and no longer referenced by
the analysis runtime.

**Testing**: Jest (`tests/unit/`, `tests/integration/`). Astro build for the
dashboard. Mirrors 004's test layout.

**Target Platform**: Azure Functions (backend) + Azure Static Web Apps (dashboard).

**Project Type**: Web application (Functions backend + Astro frontend).

**Performance Goals**: N/A beyond existing analysis runtime; document read is a
single settings-row fetch, identical cost to 004's framework read.

**Constraints**: Instructions document ≤ **256 KB** UTF-8 (FR-006); operator-only
access via function key (FR-016); the seeded document must be byte-for-byte
equivalent to the pre-feature effective system prompt (SC-004).

**Scale/Scope**: Single owner/operator; no concurrent multi-user editing
(Assumptions). History row count is small (~250/year heavy).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Privacy First (NON-NEGOTIABLE)** — ✅ The seeded merged document contains
  the owner's real framework, so it MUST be generated at migration time from
  live runtime settings and **never committed**. The committed base template
  (`weekly-rebalance-v1.md`) stays generic/placeholdered. Tests and docs use
  clearly-fake instructions. No prompt/response bodies enter operational logs
  (existing sanitization path unchanged). The seed script reads real data at
  runtime only and is privacy-safe (no hard-coded holdings).
- **II. Clean Architecture / DDD** — ✅ New `InstructionsHistoryEntry` domain
  entity; use-cases under `src/application/use-cases/instructions/`; repository
  interface `IInstructionsRepository` + Azure implementation; thin HTTP handlers
  in `src/functions/instructions.js`. `GenerateWeeklyAnalysis` orchestration
  edit stays in the use-case layer.
- **III. Idempotent Data Operations** — ✅ Seed writes exactly one version and
  is insert-only / skip-if-present. New storage means no overwrite of 004 data.
  Append-only history preserved.
- **IV. Pragmatic Testing** — ✅ Entity validation, use-case orchestration
  (no-op, size cap, restore, snapshot), and HTTP route smoke tests, mirroring
  004's coverage.
- **V. Convention-Driven Workflow** — ✅ Driven through the spec-kit pipeline.
  *Note:* the working branch is `005-editable-metaprompt` (spec-kit's `NNN-slug`
  convention from the `git.feature` hook) rather than `feature/{slug}`; the PR to
  `main` may be opened from a `feature/`-prefixed branch to match the constitution.

No new projects, no new datastore technology, no new runtime dependencies →
**Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/005-editable-metaprompt/
├── plan.md              # This file
├── spec.md              # Complete (specify + clarify)
├── research.md          # Phase 0 output (this run)
├── data-model.md        # Phase 1 output (this run)
├── quickstart.md        # Phase 1 output (this run)
├── contracts/
│   └── api.md           # Phase 1 output (this run)
└── checklists/
    └── requirements.md  # Complete — all items pass
```

### Source Code (repository root)

```text
src/
├── domain/entities/
│   ├── InstructionsHistoryEntry.js        # NEW (renamed/repurposed from FrameworkHistoryEntry; MAX_BYTES = 262144)
│   └── WeeklyAnalysis.js                   # EDIT — add optional instructionsHistoryRowKey
├── application/
│   ├── interfaces/
│   │   └── IInstructionsRepository.js      # NEW (renamed from IFrameworkRepository)
│   └── use-cases/
│       ├── instructions/                   # NEW dir (mirrors use-cases/framework/)
│       │   ├── GetActiveInstructions.js
│       │   ├── SaveInstructions.js
│       │   ├── ListInstructionsHistory.js
│       │   ├── GetInstructionsHistoryEntry.js
│       │   └── RestoreInstructionsVersion.js
│       └── analysis/
│           ├── GenerateWeeklyAnalysis.js   # EDIT — read active instructions verbatim; drop {{strategicFramework}} substitution + promptVersion/template-file load
│           └── prompts/weekly-rebalance-v1.md   # KEEP as committable seed source only (no longer loaded at runtime)
├── infrastructure/repositories/
│   └── AzureInstructionsRepository.js      # NEW (renamed from AzureFrameworkRepository; new table + settings key)
├── database/AzureTableDatabase.js          # EDIT — create portfolioInstructionsHistory table in initialize()
└── functions/
    └── instructions.js                     # NEW (renamed from framework.js; routes /api/instructions*)

dashboard/src/
├── pages/
│   ├── instructions.astro                  # NEW (renamed from framework.astro; "Instructions" labels, 256 KB counter)
│   └── analysis-detail.astro               # EDIT — read instructionsHistoryRowKey, link to /instructions#<rowKey>
├── layouts/Layout.astro                    # EDIT — nav entry { id:'instructions', label:'Instructions', href:'/instructions' }
└── lib/api.js                              # EDIT — instructions API client fns (replace framework fns)

scripts/
└── seed-instructions-from-framework.js     # NEW — reads committed base template ⊕ live analysis.strategicFrameworkV1, writes one initial instructions version (privacy-safe; gitignore if it ever embeds values)

tests/
├── unit/domain/entities/InstructionsHistoryEntry.test.js          # NEW
├── unit/application/use-cases/instructions/*.test.js              # NEW (Save/List/Restore)
├── unit/application/use-cases/analysis/GenerateWeeklyAnalysis*.test.js  # EDIT — verbatim instructions, instructionsHistoryRowKey snapshot
└── integration/functions/instructions.test.js                    # NEW (5 endpoints)
```

**Structure Decision**: Web application — Azure Functions backend (`src/`) +
Astro dashboard (`dashboard/`). This feature supersedes 004's "Framework"
surface by refactor-and-rename to "Instructions"; the old framework HTTP routes,
page, and nav entry are replaced (SC-006: exactly one place to edit AI
instructions). 004's storage tables are left untouched to satisfy non-destructive
data ops while history starts fresh in a new table (FR-020).

## Complexity Tracking

> No constitution violations requiring justification. No new projects, datastore
> technologies, or runtime dependencies are introduced.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
