# Strategic-plan tables

Split out of `CLAUDE.md` so the detail is read on demand rather than loaded into
every session. Nothing in the app consumes these tables yet — they exist for a
future rebalance evaluator. If a task touches them, start here.

## Tables

Versioned per `docs/metaprompt-rebalance-plan.md` §2/§7 (gitignored — owner-private).
TypeScript models live in `src/domain/plan/plan-entities.d.ts`.

| Table | Notes |
|---|---|
| `portfolioTargetAllocations` | target weights per bucket |
| `portfolioDeployRules` | deployment rules for incoming cash |
| `portfolioPlanVersions` | pk `versions`; exactly one row has `isActive` true |

Written by `scripts/seed-plan-version.js`, which reads the gitignored
`scripts/plan-version.local.json` (template: `scripts/plan-version.example.json`).

## Not to be confused with the weekly-analysis targets

The weekly analysis computes drift and caps from a **separate** document:
`portfolioSettings` row `analysis.allocationTargetsV1` (feature 010 schema),
seeded from `scripts/allocation-targets.local.json`.

Changing `portfolioTargetAllocations` therefore has no effect on the weekly
analysis, and vice versa. This is the single most common confusion about these
tables.

## Weekly-analysis instructions document

The weekly-analysis system prompt lives in `portfolioSettings` row
`analysis.instructionsV1`, with revision history in `portfolioInstructionsHistory`.
Since 2026-07-22 its content is the owner's portfolio framework v3.1, kept locally
at `docs/private/portfolio-framework-v3.md` and seeded via
`scripts/seed-instructions-from-framework.js`.
