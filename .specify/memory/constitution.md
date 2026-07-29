<!--
Sync Impact Report
- Version change: 1.2.0 → 1.2.1
- Ratification: 2026-05-16
- Last Amended: 2026-07-29
- Principles introduced (1.0.0): I. Privacy First (NON-NEGOTIABLE), II. Clean Architecture / DDD, III. Idempotent Data Operations, IV. Pragmatic Testing, V. Convention-Driven Workflow
- 1.1.0 amendment: Principle I gains a "Runtime egress to authorized third-party AI services" sub-clause carving out Anthropic API calls for the weekly rebalance analysis (feature 002-weekly-rebalance-analysis). Source-control prohibition unchanged. Driven by spec FR-028.
- 1.1.1 amendment (PATCH — clarification/wording): Principle V (Convention-Driven Workflow) branch-naming reconciled with actual practice and the owner's 2026-06-13 decision. The single `feature/{kebab-case}` rule is replaced by a documented split — speckit/SDD features (driven by /speckit-specify) use the bare `NNN-kebab` Spec Kit format matching their spec directory (no `feature/` prefix); ad-hoc work uses `feature/{kebab-case}` or `fix/{kebab-case}`. Development Workflow step 1 updated to match. No principle added/removed; all other guidance unchanged.
- 1.2.0 amendment (MINOR — materially expanded guidance): Two changes, both reconciling principles with shipped reality.
  (a) Principle III (Idempotent Data Operations) now names the `my-finances` MCP write tools (`update_position`, `create_position`, `set_order_execution_status`, shipped in feature 018-mcp-write-tools, PR #48) as the primary write path, with `PUT /api/positions/…` as the equivalent when MCP is unavailable. `scripts/positions.json` is restated as a recovery snapshot regenerated on demand, NOT a live mirror required to stay in sync after every change — the previous wording directly contradicted CLAUDE.md and was unkeepable once writes moved to MCP.
  (b) Principle I (Privacy First) replaces the prose instruction "before any `git add`, scan the diff … if in doubt, ask" with the mechanical enforcement that now exists: `.gitignore` as the privacy boundary (including the default-deny `docs/private/`), plus `scripts/privacy-scan.js` as a PreToolUse hook and a fail-closed CI job. The prohibition itself is unchanged and remains NON-NEGOTIABLE; only its enforcement is now checkable. Driven by a live gap: `docs/portfolio-framework-v3.md` was documented as protected but was never actually gitignored. *(Mechanism superseded by 1.2.1: the scanner engine and the hook left this repo. The substance of (b) — enforcement is mechanical, not remembered — is unchanged.)*
  No principle added or removed.
- 1.2.1 amendment (PATCH — clarification/wording): Principle I's description of *how* it is enforced is corrected to match what shipped in PR #53. The scanner engine and the git guard were deleted from this repo and now come from the shared `amajail/dev-kit@v1`; the PreToolUse hook is registered once at user level in `~/.claude/settings.json`, and only the rules stay here in `.privacy-scan.json`. The old text named `scripts/privacy-scan.js` and a repo-local `.claude/settings.json` hook — both gone, so the document was asserting an enforcement mechanism that no longer existed. The prohibition itself is untouched and remains NON-NEGOTIABLE; no principle added, removed or redefined.
- Added sections: Tech Stack & Constraints, Development Workflow, Governance
- Enforcement of Principle I (current): `.gitignore` is the boundary; `.privacy-scan.json` holds this repo's rules; the scan engine is shared at `amajail/dev-kit@v1`; it runs as a user-level PreToolUse hook (fail-open, and it only ever sees Claude's own git commands) and as the fail-closed `privacy` job in `.github/workflows/pr-checks.yml`, which is the actual guarantee. A future amendment touching Principle I MUST land in `.gitignore` or `.privacy-scan.json` here, or in an `amajail/dev-kit` PR when the engine itself must change — or state why the rule is unenforceable.
- Templates reviewed (1.2.0 pass):
  - ✅ .specify/templates/plan-template.md — Constitution Check section is generic; no edit required (principles are surfaced by reference).
  - ✅ .specify/templates/spec-template.md — no constitution-specific slots; no edit required.
  - ✅ .specify/templates/tasks-template.md — no constitution-specific slots; no edit required.
- Templates reviewed (1.2.1 pass): all five of `.specify/templates/*.md` grepped for the deleted paths and for enforcement wording — plan, spec, tasks, checklist and constitution templates. No hit; no edit required.
- Runtime guidance reviewed:
  - ✅ CLAUDE.md — rewritten during 1.2.0 (107 → 80 lines). Its `## Privacy` and `## Changing portfolio data` sections point here for rationale and carry only the operational instruction, per the division of labour: constitution = why + governing principle; CLAUDE.md = what to do now; `.gitignore` + `.privacy-scan.json` + the shared engine = enforcement. Re-checked at 1.2.1: `## Privacy` was already updated by PR #53 and needs no edit.
- Deferred TODOs: none.
-->

# my-finances Constitution

## Core Principles

### I. Privacy First (NON-NEGOTIABLE)
The repository is, or may become, public. Real personal-finance data MUST NEVER be staged, committed, or pushed. This covers: real quantities, PPC / `averageCost` values, prices, cost-basis figures, broker statements, account snapshots (`portfolio-report.html`, `plan-rebalanceo-brokers.html`, etc.), the full `scripts/positions.json`, credentials, connection strings, Azure resource names, account IDs, and real values embedded in commit messages, PR bodies, code comments, tests, or example snippets.

Affirmatively OK to commit: `scripts/positions.template.json`, code that operates on positions without hard-coding real ones, and tests using clearly-fake data.

This prohibition is enforced mechanically, not by recollection. `.gitignore` is the privacy boundary — owner-private docs live under `docs/private/`, which is ignored wholesale so a new one is protected the moment it is created. What counts as private in *this* repo is declared in `.privacy-scan.json`; the engine that reads it is shared, at `amajail/dev-kit@v1`. It runs in two layers with deliberately opposite failure modes: a `PreToolUse` hook registered once at user level in `~/.claude/settings.json`, which is **fail-open** and only ever sees git commands Claude itself issues on this machine; and the **fail-closed** `privacy` job in `.github/workflows/pr-checks.yml`, which sees everything that reaches a PR and is therefore the actual guarantee. Staging MUST name explicit paths; `git add -f` is denied outright, since its only purpose is crossing the boundary `.gitignore` draws. Any change to what counts as private MUST land in `.gitignore` or `.privacy-scan.json`, not only in prose.

**Runtime egress to authorized third-party AI services.** Real holdings data MAY flow to a named third-party AI service at runtime for analysis purposes, provided ALL of the following hold:

- The service is explicitly named in this constitution. Currently authorized: **Anthropic** (via `@anthropic-ai/sdk`), governed by Anthropic's published data-retention policy (https://www.anthropic.com/legal/privacy). Adding a new AI service requires an amendment to this clause naming the service and its policy.
- Credentials reach the runtime via environment configuration only (e.g. `ANTHROPIC_API_KEY` in Function App Application Settings, or local `local.settings.json`). Credentials MUST NEVER be checked into source control.
- The integration includes a sanitization layer that prevents the prompt body or the response body from being captured in any operational log sink (Application Insights or equivalent). Only run metadata — date, model, token counts, USD cost, status, duration, sanitized error type — may be logged.
- The carve-out applies only to the runtime egress path. The source-control prohibition stated in the paragraphs above remains in force unchanged: real holdings MUST NEVER be staged, committed, or pushed, regardless of whether they have flowed through a third-party AI service at runtime.

*Rationale: One leaked commit cannot be un-published. The cost of a missed sanitization step is permanent. The third-party-AI carve-out is deliberate: a strategic-reasoning layer benefits from frontier-model quality that cannot be matched on-device today, so the privacy boundary moves from "data never leaves my machine" to "data only leaves to a named provider under a documented policy, and never to operational logs". This is an audited carve-out, not a relaxation of the source-control prohibition.*

### II. Clean Architecture / DDD
Business logic lives in `src/application/use-cases/`. Domain entities and value objects live in `src/domain/`. Repository **interfaces** live in `src/application/interfaces/`; **implementations** (e.g. `AzureTableDatabase.js`) live in `src/database/`. HTTP and timer entry points in `src/functions/` MUST stay thin: parse input → invoke use-case → format response. No business rules in function handlers.

Positions are keyed by `partitionKey = brokerId`, `rowKey = ${assetType}__${symbol}` (see `Position.id()` in `src/domain/entities/Position.js`). Bond/BOPREAL prices follow the "per 100 nominales" (% of par) convention; new providers MUST respect it.

*Rationale: Use-cases stay portable; swapping Azure Tables for another store, or adding a CLI/MCP surface, must not require rewriting business logic.*

### III. Idempotent Data Operations
`scripts/seed-positions.js` is insert-only — existing rows MUST be skipped, never silently overwritten. Re-running a seed script with mutated data MUST NOT be used to update existing rows: it silently skips them, so the update appears to succeed while nothing changes.

Updates to existing positions go through the `my-finances` MCP write tools (`update_position` for partial patches, `create_position` for new rows, `set_order_execution_status`), which are the primary write path and audit-log every mutation. `PUT /api/positions/{broker}/{rowKey}` with a JSON patch remains the equivalent path when MCP is unavailable. Bulk updates are done by one-off scripts that issue those writes.

`scripts/positions.json` is a **recovery snapshot and seed input**, not a live mirror of the database. It is regenerated from the live store on demand — before a disaster-recovery re-seed, or when the owner asks — and MUST NOT be hand-edited. The database is the single source of truth for holdings.

*Rationale: Idempotent seeders are safe to re-run after partial failures; surprise overwrites of real financial data are not. Requiring `positions.json` to stay continuously in sync was a rule nobody could keep once writes moved to MCP, and a stale file that claims to be canonical is more dangerous than one that is honestly a snapshot.*

### IV. Pragmatic Testing
Tests are required where they pay off: domain entities and value objects (validation rules), use-cases (orchestration logic), and HTTP route smoke tests (request → response shape). TDD is not mandated. Frontend visual UI and one-off scripts are exempt unless they encode business rules.

A failing test on `main` MUST be either fixed or deleted in the same PR that surfaces it — never left red.

*Rationale: This is a single-user personal project; testing discipline tracks where bugs actually hurt (silent miscalculation, lost data) rather than chasing coverage.*

### V. Convention-Driven Workflow
Branch naming follows the kind of work: **speckit/SDD features** (anything driven by `/speckit-specify`) use the bare `NNN-kebab-description` Spec Kit format, identical to the `specs/NNN-…` directory the command creates (e.g. `010-structured-analysis-tables`) — branch name and spec directory match, and NO `feature/` prefix is added. **Ad-hoc work** (small fixes or chores not driven by a spec) uses `feature/{kebab-case}` or `fix/{kebab-case}`. Commit messages: short imperative with conventional prefixes (`feat:`, `fix:`, `refactor:`, `ci:`, `docs:`). Each non-trivial feature is driven through the spec-kit pipeline: `/speckit-constitution` (once) → `/speckit-specify` → `/speckit-clarify` (when ambiguity exists) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.

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

1. **Branch.** Cut from `main`: speckit features use the bare `NNN-kebab` Spec Kit format (matching the spec directory `/speckit-specify` creates); ad-hoc fixes/chores use `feature/{kebab-case}` or `fix/{kebab-case}`. Worktree-based work is allowed and encouraged for parallel features.
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

**Version**: 1.2.1 | **Ratified**: 2026-05-16 | **Last Amended**: 2026-07-29
