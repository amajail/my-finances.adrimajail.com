# Data Model: Dashboard Metrics Trim

**Feature**: 003-dashboard-metrics-trim
**Date**: 2026-05-17

## Scope

This feature introduces **no new persisted entities, no new tables, no API shape changes, and no migrations**. The backend `Position` entity, the `portfolioPositions` Azure Table, and the `/api/positions` response are all unchanged.

What changes is only the **frontend view-model** for a single position row inside a broker's table on the home dashboard. This document describes that view-model — what each cell is, what it's derived from, and what gets shown when the source data can't produce a value.

## View-Model: Broker-Table Row

A broker-table row on the home dashboard exposes exactly four user-visible cells. The view-model is derived per-render from the corresponding `Position` record.

| Cell | Source field on row object | Derivation | Display |
|------|---------------------------|------------|---------|
| Symbol | `p.symbol`, `p.assetType` | Direct from `Position`. | `{symbol}` rendered bold, followed by `{assetType}` rendered as a small dimmer tag (existing styling). |
| Value | `mv` (market value) | `mv = marketValue(p)` from `dashboard/src/lib/pricing.js`. Formula: `quantity * (effectivePrice(p) / priceFaceValue(assetType))`. Returns `null` when `effectivePrice(p)` is `null` (no current price and not a hold-at-par asset). | `${mv.toFixed(0)} ${p.currency}` when non-null; `—` otherwise. Right-aligned, monospace digits. |
| P&L | `pnl` (unrealized profit / loss) | `pnl = mv - cb` where `cb = costBasis(p) = quantity * (averageCost / priceFaceValue(assetType))`. `null` when `mv` is `null`. | `${pnl.toFixed(0)}` when non-null; `—` otherwise. Right-aligned, monospace digits, with gain/loss color class. **No currency suffix** (existing behavior). |
| % | `pct` (unrealized P&L as % of cost basis) | `pct = (pnl / cb) * 100` when `cb > 0 && pnl != null`; otherwise `null`. | `fmtPct(pct)` from `format.js`: signed (`+1.23%` / `-1.23%`), 2 decimals, `—` for `null`. Right-aligned, monospace digits, with gain/loss color class. |

### Row object shape (in memory, after `buildBrokerRows`)

```text
{
  p:      Position,                 // pass-through reference to the broker's position record
  price:  number | null,            // effectivePrice(p) — UNUSED for rendering after this feature;
                                    //   kept because marketValue() already calls it. Optional cleanup.
  mv:     number | null,            // marketValue(p) — drives the "Value" cell
  pnl:    number | null,            // mv - costBasis(p) — drives the "P&L" cell
  pct:    number | null             // (pnl / costBasis) * 100 — drives the "%" cell
}
```

### Sortable keys (after this feature)

`SORT_ACCESSORS` exposes exactly four keys:

| Key      | Accessor       | Notes |
|----------|----------------|-------|
| `symbol` | `r.p.symbol`   | String compare (`localeCompare`) — alphabetical. |
| `value`  | `r.mv`         | Numeric, nulls always sort last regardless of direction (existing behavior in `sortRows`). |
| `pnl`    | `r.pnl`        | Numeric, nulls last. |
| `pct`    | `r.pct`        | Numeric, nulls last. |

The keys `quantity`, `averageCost`, and `price` are **removed** from `SORT_ACCESSORS` in this feature.

### Default sort state (new in this feature)

```text
{
  sortKey:     'value',
  sortDir:     'desc',
  activeAsset: 'all'
}
```

This replaces the previous initializer that used `sortKey: null`. The sort indicator (▼) renders on the Value column header on first paint.

## State transitions

The state of a broker table evolves through a small finite set of user actions. None are new to this feature; only the **initial** state changes.

| From | Trigger | To |
|------|---------|-----|
| _(no state)_ | Page load → `brokerState.set(brokerId, {...})` | `sortKey='value'`, `sortDir='desc'`, `activeAsset='all'` |
| Any | User clicks a column header where `state.sortKey === clicked` | `sortDir` toggles (`asc` ⇄ `desc`); render |
| Any | User clicks a column header where `state.sortKey !== clicked` | `sortKey = clicked`, `sortDir = 'asc'`; render |
| Any | User clicks an asset-type filter pill | `activeAsset = pill.dataset.asset`; render |

The sort state and the filter state are independent and compose: changing one does not reset the other.

## What this feature does NOT change

- Backend `Position` domain entity (`src/domain/entities/Position.js`) — unchanged.
- Azure Table `portfolioPositions` schema — unchanged.
- `GET /api/positions` response shape — unchanged. The dashboard continues to receive every field (including `quantity`, `averageCost`, `currentPrice`) — it simply does not render them in this view.
- `dashboard/src/lib/pricing.js` (`effectivePrice`, `marketValue`, `costBasis`, `priceFaceValue`) — unchanged.
- `dashboard/src/lib/format.js` (`fmtUsd`, `fmtArs`, `fmtPct`, `pnlClass`, `brokerTypeLabel`) — unchanged.
- Other dashboard sections on the home page (grand total, stat row, broker summary cards, Top / Bottom performers) — unchanged.
- The standalone `/positions` page, `/brokers`, `/analysis`, `/settings` — unchanged.
