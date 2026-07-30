# my-finances — Repo Guide

Personal investments tracker. Azure Functions (Node) backend + Astro dashboard, persisted to
Azure Table Storage. Ports: Functions on `http://localhost:7071/api`, Azurite for tables.
Machine-specific facts (real resource names, local paths) are in @CLAUDE.local.md — gitignored.

## Read this first
1. **Treat this repo as public. NEVER commit real quantities, `averageCost`/PPC, prices, account IDs, or credentials — use placeholders (`SYMBOL`, `123.45`, `BROKER`). Stage explicit paths; `git add -f`, `-A`, and `.` are gated by a hook. NEVER work around a block — fix the file or ask the owner.**
2. **Fixed income (`bond|bopreal|on|lecap`) is stored per 100 nominales. NEVER write a fixed-income price without first deriving that row's scale factor from its own live `currentPrice` — it differs per instrument, and a wrong factor corrupts data by 100-1000×.**
3. **`scripts/positions.json` is insert-only seed input, not a live mirror. NEVER hand-edit it, and NEVER re-run `seed-positions.js` to update an existing row — it silently skips. Use the MCP `update_position` tool.**

## Architecture (clean / DDD-style)
- `src/domain/entities/` — `Position`, `Broker`, `Price` (immutable, validated); `src/domain/value-objects/` — `BrokerId`, `Symbol`, `Quantity`, `AssetType`
- `src/application/use-cases/` — orchestrators (CreatePosition, RefreshPrices, …); `src/application/interfaces/` — repo interfaces
- `src/database/AzureTableDatabase.js` — concrete repo impl; `src/shared/` — errors, logger, response helpers
- `src/functions/` — HTTP/timer entry points, thin: parse → use-case → respond. Astro dashboard under `dashboard/`.
- Storage is Azure Table via `@azure/data-tables` — not SQLite/Postgres (canonical: constitution Tech Stack).

## Tables
All 8 created in `src/database/AzureTableDatabase.js`: `portfolioBrokers`, `portfolioPositions`,
`portfolioSettings`, `portfolioPrices`, `portfolioAnalysis`, `portfolioOrders`,
`portfolioInstructionsHistory`, `portfolioAudit`. Positions are keyed by `partitionKey = brokerId`,
`rowKey = ${assetType}__${symbol}` (`Position.id()` in `src/domain/entities/Position.js:239`).
Strategic-plan tables and the weekly-analysis instructions document are seeded but not consumed by
the app — if a task touches either, read `docs/architecture/plan-tables.md` first.

## Position schema (key fields)
`brokerId`, `assetType` (stock|etf|bond|cedear|cash|deposit|bopreal|lecap|on), `symbol`,
`displayName`, `quantity`, `averageCost` (PPC), `currency`, `currentPrice`,
`currentPriceUpdatedAt`, `exchange`, `maturityDate`, `status` (open|closed), `realizedPnl`, `notes`.
- `averageCost` = cost basis per unit (PPC in Spanish broker statements); `currentPrice` is
  written only by the `RefreshPrices` use case — never seed it by hand.
- Fixed-income scale: rule 2 above; procedure in `.claude/skills/sync-positions/SKILL.md` §3.
- Broker slugs: `galicia`, `iol`, `ibkr`, `bullmarket`, `cash` (off-system USD reserve).

## API endpoints (portfolio data; analysis/instructions/calendar routes not listed)
- `GET /api/positions?broker={id}&status={open|closed}` — list; `POST /api/positions` — create
- `GET|PUT|DELETE /api/positions/{broker}/{rowKey}` (e.g. `cedear__GOOGL`); PUT is a partial patch
- `POST /api/prices/refresh` — needs the Function App key (`authLevel: 'function'`). Production
  refresh is the 16:30-ET weekday timer in `refreshPricesTimer.js`. Don't add a UI trigger.
- `GET /api/brokers`, `POST /api/brokers` — broker CRUD

## Changing portfolio data
Use the `my-finances` MCP tools for every portfolio read and write: `list_positions` /
`portfolio_summary` to read, `update_position` (partial patch; large quantity changes need
`confirm: "true"`) and `create_position` to write, `set_order_execution_status` and
`trigger_price_refresh` for maintenance, `list_audit_entries` to review writes (all are
audit-logged). Fall back to `PUT /api/positions/{broker}/{rowKey}` only if MCP isn't connected.
- To sync real IOL/IBKR holdings, use the `sync-positions` skill: pull → diff against the live store → confirm → apply.
- To bulk-update outside MCP, name the script `scripts/update-<YYYY-MM-DD>.local.js`. That exact
  pattern is already gitignored; do not invent another name.
- Regenerate `scripts/positions.json` from the live store only before a disaster-recovery re-seed,
  or when the owner asks (rule 3).

## Conventions
- Branches: speckit features use bare `NNN-kebab` matching their `specs/` dir (no `feature/`
  prefix); ad-hoc work uses `feature/…` or `fix/…`. Canonical: constitution §V.
- Commit subject: `<type>: <imperative>`, ≤72 chars, type ∈ `feat|fix|refactor|docs|test|ci|chore|perf`.
- Ask before committing ad-hoc work; speckit/SDD work may be committed as it goes.

## Privacy
Enforced, not remembered: `.gitignore` is the privacy boundary; the shared scanner (`amajail/dev-kit`)
runs on every PR (CI) and before your git commands (hook, registered once in `~/.claude`, not here).
This repo owns only the rules — change what counts as private in `.privacy-scan.json`, never in
prose. Rule 1 says what must never ship. Canonical rationale: constitution §I.
- Private docs with real figures go in `docs/private/` (ignored wholesale) — never elsewhere under `docs/`.
- A file that must hold credential-shaped test data can carry a `privacy-scan: allow-secrets` comment.

## When I get something wrong
If the owner corrects you on a repo convention, offer to run `/claude-md-fix`: it finds the
sentence that permitted the error and fixes it in the right place (`.privacy-scan.json`, `.gitignore`,
constitution, or here), logging to `docs/claude-md-log.md`. If the same rule appears 3 times in
that log it must become a scanner rule or a `.gitignore` entry — or be deleted as unenforceable:
prose that has failed three times won't work the fourth. Soft cap: 80 lines, and 3 bold spans —
if a fourth thing needs bold, one of the three isn't earning it. Adding more than 4 lines means
deleting something else in the same edit.

<!-- SPECKIT START -->
Current plan: none active. Most recent: `specs/019-earmarked-positions/plan.md` (shipped, PR #50).
Companion artifacts (`spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`) sit alongside each plan.
<!-- SPECKIT END -->
