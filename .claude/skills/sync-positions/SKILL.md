---
name: "sync-positions"
description: "Sync live IOL/IBKR broker holdings into the portfolio store: pull via MCP connectors, diff against the live store, apply via dry-run script."
metadata:
  author: "my-finances"
user-invocable: true
disable-model-invocation: false
---

# sync-positions

Encodes the owner's proven workflow for reconciling real broker holdings (IOL,
IBKR) against the `portfolioPositions` table in Azure Table Storage. This is a
manual, human-in-the-loop process — never auto-apply changes without an
explicit confirmation step.

Follow these steps in order.

## Step 1 — Pull live holdings via MCP connectors

Available in Claude Code sessions (Claude Desktop connectors surfaced as MCP
tools):

- **IOL**: `mcp__claude_ai_Invertir_Online__get_portfolio` for positions, plus
  `mcp__claude_ai_Invertir_Online__get_balance` for cash.
- **IBKR**: `mcp__claude_ai_Interactive_Brokers_IBKR__get_account_positions`
  for positions, plus `mcp__claude_ai_Interactive_Brokers_IBKR__get_account_balances`
  for cash.

These are **deferred tools** — their schemas are not loaded by default. Call
`ToolSearch` with `select:<tool_name>` (or a keyword query) first to load the
schema before invoking them.

If the connectors are unavailable in the current session (e.g. running
outside Claude Code, or the connector isn't authorized), fall back to asking
the owner to pull the portfolio/balance JSON manually via Claude Desktop and
paste it in.

Map each holding to the `Position` schema (see `src/domain/entities/Position.js`
and CLAUDE.md):

`brokerId`, `assetType` (`stock|etf|bond|cedear|cash|deposit|bopreal|lecap|on`),
`symbol`, `quantity`, `averageCost`, `currency`, `currentPrice`,
`maturityDate`, `notes`.

## Step 2 — Diff against the LIVE store, never `scripts/positions.json`

`scripts/positions.json` is a snapshot and goes stale — it must never be the
diff baseline. Always diff against the running store:

1. Start the Functions host: `func start` (reads `local.settings.json`, which
   points at the **real** cloud storage account — this is intentional; there
   is no local Azurite mirror of production data. Timers are disabled when
   running locally, and `API_REQUIRE_AUTH=false` locally so no function key is
   needed).
2. Fetch current state: `GET http://localhost:7071/api/positions?broker=iol`
   and `GET http://localhost:7071/api/positions?broker=ibkr`.
3. Compute the real delta: new rows, quantity changes, cost-basis changes,
   and positions that should be closed (present in the store but no longer
   held at the broker).

**Storage-account gotcha:** `.env` points some ad-hoc/data scripts at a
*different* storage account (used for other projects). The finance store's
connection string lives in `local.settings.json`. Any one-off script you write
must explicitly load/force the connection string from `local.settings.json`,
not `.env`, or it will silently read/write the wrong account.

## Step 3 — Data rules (non-negotiable)

- **IOL has no cost basis.** The IOL connector does not expose `averageCost`
  (it comes back null/absent). For IOL updates: PUT `quantity` only, and
  **preserve the existing stored `averageCost`** — do not overwrite it with
  null or a guess.
- **IBKR has real cost basis.** The IBKR connector does expose cost basis, so
  it's safe to overwrite `averageCost` from IBKR data.
- **`averageCost` is required on create.** Position validation rejects
  `null`/missing `averageCost`. Use a documented placeholder when creating a
  new row where no real cost basis is available: `1` for cash rows, otherwise
  a last-known-price placeholder (and note it, e.g. `notes: "averageCost seeded from last price — verify"`).
- **Currency whitelist.** The `Money` value object only accepts
  `ARS|USD|EUR|BRL|GBP|JPY|CNY`. Any other currency reported by a broker
  (e.g. CAD) must be stored as `USD` (convert or flag in `notes`, per the
  owner's convention at the time).
- **Fixed-income scale gotcha (`bond`/`bopreal`/`on`/`lecap`).** The store
  keeps `averageCost` and `currentPrice` **per 100 nominales**, on the
  app's own IOL price-provider scale — which can be roughly **100x to 1000x
  larger** than the raw price the IOL connector reports, and **the factor
  differs per instrument** (do not assume a single multiplier applies across
  bonds).
  - Never blanket-multiply by a guessed factor.
  - Rescale each row against its *own* live app price: compare the
    connector-reported price to the row's stored/refreshed `currentPrice` to
    derive that instrument's factor before writing anything.
  - Sanity-check the resulting P&L% after rescaling — a P&L in the thousands
    of percent is a strong signal the scale is wrong, not that the position
    mooned.
  - Cross-check the same instrument at another broker if it's held in more
    than one, as an independent sanity check on the derived factor.
- **Symbol typos silently break things.** Watch for lookalike characters on
  create (e.g. letter `O` vs. digit `0`) — a misspelled symbol won't error
  immediately, it just silently breaks `RefreshPrices` for that row later.

## Step 4 — Apply via a gitignored dry-run script

Write a one-off script at `scripts/update-<YYYY-MM-DD>.local.js`. The
`scripts/*.local.js` and `scripts/update-*.js` gitignore rules already cover
this filename pattern, so it will not be committed.

The script must:

- Support a `--dry-run` flag (default to dry-run; require an explicit flag
  like `--apply` to actually write).
- `POST /api/positions` for brand-new rows.
- `PUT /api/positions/{broker}/{assetType}__{symbol}` for updates, using
  **partial bodies** — only include the fields that are actually changing, so
  omitted fields (e.g. `averageCost` for an IOL quantity-only update) are
  preserved rather than clobbered.
- Print a clear diff (old vs. new) for every row it would touch.
- Only perform the real writes after the owner explicitly confirms the
  dry-run diff looks right.

## Step 5 — Verify and close out

1. `GET` the affected `/api/positions?broker=...` endpoints again to confirm
   the store now matches what was applied.
2. Optionally `POST /api/prices/refresh` locally to confirm any newly created
   symbols price correctly (catches symbol typos from Step 3 early).
3. **Stop the `func start` host** — remember it is pointed at production
   data, don't leave it running unattended.
4. Regenerate `scripts/positions.json` from the live store so the canonical
   snapshot stays in sync with what was just applied. This file is
   gitignored — never commit it.

## Privacy reminder

Nothing produced by this workflow (the `update-*.local.js` script, diffs,
logs) may be committed if it contains real quantities, `averageCost`/PPC
values, prices, or account identifiers. See CLAUDE.md's "Privacy" section.
