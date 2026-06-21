# my-finances — Repo Guide

Personal investments tracker. Azure Functions (Node) backend + Astro dashboard frontend, persisted to Azure Table Storage.

## Stack
- **Backend:** Azure Functions v4 (Node.js) — `src/functions/`
- **Frontend:** Astro app under `dashboard/`
- **DB:** Azure Table Storage via `@azure/data-tables` (NOT SQLite/Postgres)
- **Local dev:** Functions on `http://localhost:7071/api`; Azurite for tables

## Architecture (clean / DDD-style)
- `src/domain/entities/` — `Position`, `Broker`, `Price`, etc. (immutable, validated)
- `src/domain/value-objects/` — `BrokerId`, `Symbol`, `Quantity`, `AssetType`
- `src/application/use-cases/` — orchestrators (CreatePosition, UpdatePosition, RefreshPrices, …)
- `src/application/interfaces/` — repository interfaces (`IPositionRepository`, …)
- `src/database/AzureTableDatabase.js` — concrete repo implementation
- `src/functions/` — HTTP/timer entry points (thin: parse → use-case → respond)
- `src/shared/` — errors, logger, response helpers

## Tables
`portfolioBrokers`, `portfolioPositions`, `portfolioSettings`, `portfolioPrices`.

Positions are keyed by `partitionKey = brokerId`, `rowKey = ${assetType}__${symbol}` (see `Position.id()` in `src/domain/entities/Position.js:240`).

## Position schema (key fields)
`brokerId`, `assetType` (stock|etf|bond|cedear|cash|deposit|bopreal|lecap|on), `symbol`, `displayName`, `quantity`, `averageCost` (PPC), `currency`, `currentPrice`, `currentPriceUpdatedAt`, `exchange`, `maturityDate`, `status` (open|closed), `realizedPnl`, `notes`.

- `averageCost` = user's cost basis per unit (a.k.a. **PPC** in Spanish broker statements).
- `currentPrice` is auto-refreshed by `RefreshPrices` use case (timer + `POST /api/prices/refresh`). Not seeded manually.
- For bonds/BOPREAL, prices are typically **per 100 nominales** (% of par convention); see existing `notes: "Quoted per 100 nominales — verify"` on IOL BPOC7.

## Brokers
Slugs: `galicia`, `iol`, `ibkr`, `bullmarket`, `cash` (off-system USD reserve).

## API endpoints (for data updates)
- `GET /api/positions?broker={id}&status={open|closed}` — list
- `POST /api/positions` — create (used by `scripts/seed-positions.js`)
- `GET|PUT|DELETE /api/positions/{broker}/{rowKey}` — fetch/update/delete one
  - `rowKey` = `${assetType}__${symbol}` (e.g., `cedear__GOOGL`, `bond__GD35`)
  - PUT accepts partial body (patch semantics) — preferred for "update PPC for one holding"
- `POST /api/prices/refresh` — refresh all current prices. **Operator-only** since the dashboard's manual refresh button was removed; the production refresh path is the daily timer (`src/functions/refreshPricesTimer.js`, 16:30 ET weekdays). Endpoint requires the Function App key (`authLevel: 'function'`).
- `GET /api/brokers`, `POST /api/brokers` — broker CRUD

## Seeding scripts
- `scripts/seed-positions.js` — POSTs `scripts/positions.json` rows. **Idempotent insert only**: existing rows are skipped, NOT updated. For updates use `PUT /api/positions/{broker}/{rowKey}` directly.
- `scripts/seed-brokers.js` — broker records + settings.
- `scripts/positions.json` is the canonical snapshot of holdings (last drafted from `portfolio-report.html`).

## Working on data updates
1. To update an existing position's `averageCost` (PPC) or `quantity`: send `PUT /api/positions/{broker}/{rowKey}` with a JSON patch — do NOT re-run `seed-positions.js` (it skips existing).
2. To add new positions: append to `scripts/positions.json` and run `node scripts/seed-positions.js`.
3. To bulk-update many positions: write a one-off `scripts/` script that issues PUTs (or extend `seed-positions.js` with an `--update` flag).
4. Always keep `scripts/positions.json` in sync with the DB so it remains the canonical snapshot.

## Conventions
- Branch naming:
  - **SDD / speckit features** (anything spec'd via `/speckit-specify`): use the Spec Kit format `NNN-kebab-description`, matching the `specs/NNN-…` directory the command creates (e.g., `009-performance-benchmarks`, `010-structured-analysis-tables`). The branch and its spec directory share the same name. Do **not** add a `feature/` prefix to these.
  - **Ad-hoc work** (small fixes/chores not driven by a spec): `feature/{kebab-case}` or `fix/{kebab-case}` (e.g., `fix/register-007-functions`).
- Commit style: short imperative (`fix:`, `feat:`, `ci:` prefixes used recently).

## Privacy: never commit personal or holdings data
This repo is (or may become) public. Real portfolio data must stay local.

**Never stage, commit, or push anything containing:**
- Real quantities, PPC / `averageCost` values, prices, or cost-basis figures for actual holdings.
- Broker statements, account snapshots, or portfolio reports (`portfolio-report.html`, `plan-rebalanceo-brokers.html`, etc.).
- The full `scripts/positions.json` (the canonical real-holdings snapshot — already gitignored; keep it that way).
- One-off seed/update scripts that hard-code real values (e.g. `scripts/update-bullmarket-YYYY-MM-DD.js`). Either gitignore them, keep them outside the repo, or replace literals with env vars / external JSON before committing.
- Credentials, connection strings, Azure resource names, account IDs — anything that ties this code to the user's actual accounts. `.env*` and `local.settings.json` are gitignored; don't bypass that.
- Real values embedded in commit messages, PR descriptions, code comments, test fixtures, or example snippets in committed files. Use obvious placeholders (`SYMBOL`, `123.45`, `BROKER`) in anything that will be committed.

**Affirmatively OK to commit:** `scripts/positions.template.json` (placeholder schema), code that operates on positions without hard-coding real ones, and tests that use clearly-fake data.

**Before any `git add` / commit:** if the change touches `scripts/`, fixtures, docs, or comments, scan the diff for real symbols + quantities + PPCs together. If in doubt, ask the user before staging.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at
`specs/015-analysis-token-diet-v2/plan.md` (Phase 1 complete; tasks pending).
Companion artifacts in the same folder: `spec.md`, `research.md`,
`data-model.md`, `quickstart.md`, `contracts/prompt-changes.md`. This feature is a
second token-diet pass (after 011), focused on the cost-dominant OUTPUT plus
now-redundant input. NO schema/data/model change. Three levers: (1) strengthen the
fixed `guardrail-preamble-v1.md` so `markdownBody` INTERPRETS rather than reproduces
the deterministic tables (drift, caps, positionChanges, macroChanges from 012,
duplications from 014, administrative positions from 013) — required sections
(summary, market context, assessment, suggested actions, watchlist) still kept;
(2) in `_buildUserMessage`, drop the redundant prior-macro panel from
`## previousAnalysis` (redundant given 012's deterministic macro week-over-week),
keeping prior summary + open suggestions; (3) omit unavailable indicators from
`## macroContext` instead of null placeholders. Default model UNCHANGED (downgrade
is an owner-config lever, out of scope). Verified by A/B on identical captured
inputs comparing recorded tokensOut/costUsd; 15% is a directional target with a
hard "no required section dropped" gate. Best built after 012/013/014 merge so the
"interpret not restate" rule references sections present on main. Third of three
sibling features (013 admin positions; 014 duplicate detector; 015 here). Prior
plan: `specs/014-duplicate-holdings-detector/plan.md`.
<!-- SPECKIT END -->
