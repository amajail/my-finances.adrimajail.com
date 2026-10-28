# Contract: weekly analysis read surfaces

Applies to `GET /api/analysis/weekly/{date}` (existing route) and the MCP tool `get_weekly_analysis`. Additive only: no field is removed or renamed. Placeholders below.

## Order object (each item of `orders[]`)

New field:

| Field | Type | Meaning |
|---|---|---|
| `ageWeeks` | integer 0..8 | 0 = new; N = this order was already pending for N prior consecutive weeks when issued. Absent on old rows is returned as 0. |

Existing `proposedStatus` (`executed` \| `partial`) now considers position changes from the order's own week and every later completed week, never `skipped` from elapsed time alone. It is still display-only; no write occurs.

## Analysis object

New field:

| Field | Type | Meaning |
|---|---|---|
| `confirmationItems` | array | Items needing owner confirmation; `[]` when none. |

Item shape:

```json
{
  "broker": "BROKER",
  "symbol": "SYMBOL",
  "side": "buy",
  "quantity": 1,
  "ageWeeks": 4,
  "originDate": "2026-01-02",
  "lastDate": "2026-01-23",
  "lastIndex": 0,
  "reason": "stale",
  "proposedStatus": null
}
```

`reason` is `stale` (pending for more than the threshold) or `likely-filled` (position changes show a matching move; `proposedStatus` is `executed` or `partial`).

## Behavioural guarantees

1. An order whose chain is stale or likely-filled never appears in `orders[]` of a newly generated analysis; it appears only in `confirmationItems`.
2. An order within the threshold may appear in `orders[]` with `ageWeeks >= 1`.
3. To resolve an item, record an outcome on the order row at `lastDate` and `lastIndex` with the existing write. "Still wanted" is `skipped` with a note such as "still wanted"; the chain ends and a fresh order may follow. An unresolved item keeps counting as pending in later runs.
4. Resolving an order via the existing execution-status write (`PUT` order status / MCP `set_order_execution_status`) removes its chain from the next generated analysis. The write contract is unchanged.
5. Analyses generated before this feature return `ageWeeks: 0` on orders and `confirmationItems: []`.

## Model input (internal, `## pendingOrders` block)

JSON array of chains with `broker, symbol, side, quantity, ageWeeks, status, reason`, plus the numeric threshold. Empty array when none. Internal contract between `GenerateWeeklyAnalysis` and the prompt; not exposed over HTTP.
