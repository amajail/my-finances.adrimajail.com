<!--
Sync Impact Report
- Version change: (initial) → 1.0.0
- Ratification: 2026-05-16
- Principles introduced: I. Privacy First (NON-NEGOTIABLE), II. Clean Architecture / DDD, III. Idempotent Data Operations, IV. Pragmatic Testing, V. Convention-Driven Workflow
- Added sections: Tech Stack & Constraints, Development Workflow, Governance
- Templates reviewed:
  - ✅ .specify/templates/plan-template.md — Constitution Check section is generic; no edit required (principles are surfaced by reference).
  - ✅ .specify/templates/spec-template.md — no constitution-specific slots; no edit required.
  - ✅ .specify/templates/tasks-template.md — no constitution-specific slots; no edit required.
- Runtime guidance reviewed:
  - ✅ CLAUDE.md — already encodes Privacy First and branch naming; this constitution makes them formal. No edits forced.
- Deferred TODOs: none.
-->

# my-finances Constitution

## Core Principles

### I. Privacy First (NON-NEGOTIABLE)
The repository is, or may become, public. Real personal-finance data MUST NEVER be staged, committed, or pushed. This covers: real quantities, PPC / `averageCost` values, prices, cost-basis figures, broker statements, account snapshots (`portfolio-report.html`, `plan-rebalanceo-brokers.html`, etc.), the full `scripts/positions.json`, credentials, connection strings, Azure resource names, account IDs, and real values embedded in commit messages, PR bodies, code comments, tests, or example snippets.

Affirmatively OK to commit: `scripts/positions.template.json`, code that operates on positions without hard-coding real ones, and tests using clearly-fake data. Before any `git add`, scan the diff for real symbols + quantities + PPCs together; if in doubt, ask the user before staging.

*Rationale: One leaked commit cannot be un-published. The cost of a missed sanitization step is permanent.*

### II. Clean Architecture / DDD
Business logic lives in `src/application/use-cases/`. Domain entities and value objects live in `src/domain/`. Repository **interfaces** live in `src/application/interfaces/`; **implementations** (e.g. `AzureTableDatabase.js`) live in `src/database/`. HTTP and timer entry points in `src/functions/` MUST stay thin: parse input → invoke use-case → format response. No business rules in function handlers.

Positions are keyed by `partitionKey = brokerId`, `rowKey = ${assetType}__${symbol}` (see `Position.id()` in `src/domain/entities/Position.js`). Bond/BOPREAL prices follow the "per 100 nominales" (% of par) convention; new providers MUST respect it.

*Rationale: Use-cases stay portable; swapping Azure Tables for another store, or adding a CLI/MCP surface, must not require rewriting business logic.*

### III. Idempotent Data Operations
`scripts/seed-positions.js` is insert-only — existing rows MUST be skipped, never silently overwritten. Updates to existing positions go through `PUT /api/positions/{broker}/{rowKey}` with a JSON patch. Bulk updates are done by one-off scripts that issue PUTs, not by re-running seed scripts with mutated data.

`scripts/positions.json` is the canonical local snapshot of holdings and MUST stay in sync with the database after any change.

*Rationale: Idempotent seeders are safe to re-run after partial failures; surprise overwrites of real financial data are not.*

### IV. Pragmatic Testing
Tests are required where they pay off: domain entities and value objects (validation rules), use-cases (orchestration logic), and HTTP route smoke tests (request → response shape). TDD is not mandated. Frontend visual UI and one-off scripts are exempt unless they encode business rules.

A failing test on `main` MUST be either fixed or deleted in the same PR that surfaces it — never left red.

*Rationale: This is a single-user personal project; testing discipline tracks where bugs actually hurt (silent miscalculation, lost data) rather than chasing coverage.*

### V. Convention-Driven Workflow
Feature branches: `feature/{kebab-case-description}`. Commit messages: short imperative with conventional prefixes (`feat:`, `fix:`, `refactor:`, `ci:`, `docs:`). Each non-trivial feature is driven through the spec-kit pipeline: `/speckit-constitution` (once) → `/speckit-specify` → `/speckit-clarify` (when ambiguity exists) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.

*Rationale: Consistent branch and commit shape keeps the history scannable; the SDD pipeline forces ambiguity to surface in writing before code is written.*

## Tech Stack & Constraints

- **Backend:** Azure Functions v4 (Node.js ≥ 18). Functions defined in `src/functions/` via `app.http(...)` / `app.timer(...)`.
- **Frontend:** Astro app under `dashboard/`. Static-built and deployed to Azure Static Web Apps.
- **Database:** Azure Table Storage via `@azure/data-tables`. Tables: `portfolioBrokers`, `portfolioPositions`, `portfolioSettings`, `portfolioPrices`. SQLite, Postgres, or any other relational store MUST NOT be introduced without amending this constitution.
- **Price providers:** Yahoo Finance (default), IOL and Cohen (Argentine fixed-income, via HTML scrape), routed through `PriceProviderRouter`. New providers slot into the router; the `RefreshPrices` use-case orchestrates.
- **Brokers:** `galicia`, `iol`, `ibkr`, `bullmarket`, `cash`. Adding a new broker requires both a record in `portfolioBrokers` and entries in `scripts/seed-brokers.js`.
- **Deployment:** GitHub Actions — `deploy-azure-function.yml` (backend), `deploy-dashboard.yml` (frontend), `pr-checks.yml` (Jest + Astro build on PRs to `main`).
- **Local dev:** Functions on `http://localhost:7071/api`; Azurite for tables. `local.settings.json` and `.env*` are gitignored.

New runtime dependencies (npm packages, Azure services, third-party APIs) MUST be justified in the feature's `plan.md` Complexity Tracking section.

## Development Workflow

1. **Branch.** Cut `feature/{kebab-case}` from `main`. Worktree-based work is allowed and encouraged for parallel features.
2. **Spec.** Run `/speckit-specify` to draft the user-facing spec under `specs/<NNN>-<slug>/spec.md`. WHAT and WHY only — no tech.
3. **Clarify.** Run `/speckit-clarify` if the spec has open questions. Answers land in the spec's Clarifications log.
4. **Plan.** Run `/speckit-plan` to produce `plan.md` (and `research.md`, `data-model.md`, `contracts/` as applicable). HOW only.
5. **Tasks.** Run `/speckit-tasks` to break the plan into dependency-ordered tasks.
6. **Analyze.** Run `/speckit-analyze` to cross-check spec ↔ plan ↔ tasks before any code change.
7. **Implement.** Run `/speckit-implement` (or implement manually following the task list). Commit incrementally with conventional messages.
8. **PR.** Open PR to `main`. `pr-checks.yml` MUST pass. Self-review the diff for Privacy First violations before requesting review.
9. **Merge & deploy.** Squash-merge keeps history clean; the deploy workflows trigger automatically.

## Governance

This constitution supersedes ad-hoc conventions in `CLAUDE.md` where they conflict. Amendments require:
- A PR that updates `.specify/memory/constitution.md` with an updated Sync Impact Report.
- A version bump per semver: **MAJOR** for backward-incompatible principle removal/redefinition, **MINOR** for new principles or materially expanded guidance, **PATCH** for clarifications and wording.
- A scan of all `.specify/templates/*.md` for references that would be broken by the change.

Compliance is verified at `/speckit-plan` time (Constitution Check section) and at PR review. Any deviation MUST be justified in the plan's Complexity Tracking section, not hidden in code.

**Version**: 1.0.0 | **Ratified**: 2026-05-16 | **Last Amended**: 2026-05-16
