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
- `POST /api/prices/refresh` — refresh all current prices
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
- Feature branches: `feature/{kebab-case-description}` (enforced).
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
