# Phase 1 Data Model: Suggestion Scorecard

**Feature**: 007-suggestion-scorecard | **Date**: 2026-06-12

Extends the existing `SuggestedOrder` entity / `portfolioOrders` table. No new tables.

---

## Entity: SuggestedOrder (extended)

File: `src/domain/entities/SuggestedOrder.js`. Add three OPTIONAL fields; the entity stays
immutable (the write is a row-level Merge, not an entity mutation — see repository below).

| New field | Type | Default | Notes |
|---|---|---|---|
| `executionStatus` | enum | `"pending"` | `pending` \| `executed` \| `partial` \| `skipped` |
| `executionNote` | string \| null | `null` | Optional owner note; max 500 chars (FR-002) |
| `executionUpdatedAt` | ISO string \| null | `null` | When the status was last changed |

### Validation (additions)
- `executionStatus`, if present, MUST be one of the four enum values; absent/empty → `pending`.
- `executionNote`, if present, MUST be a string within the length cap.
- Existing fields (broker, symbol, side, quantity, rationale, conviction) unchanged and still required.

### Lifecycle
- `pending` → `executed` | `partial` | `skipped` (set by the owner; FR-001).
- Any non-pending → another non-pending or back to `pending` (owner may edit/unmark; FR-003).
- A date with **any** order in a non-pending status is **frozen** (FR-004): the generation use-case
  skips re-runs for that date. Returning all orders to `pending` un-freezes it.

---

## Value object (transient): Proposed status

Computed at read time by `OrderExecutionMatcher`, never stored. Attached to each **pending** order
in the detail response as `proposedStatus` (one of `executed`|`partial`|`skipped`), or absent when
`positionChanges` is `null`/unknown.

`OrderExecutionMatcher.propose(order, positionChanges)`:
- Find position changes for `order.symbol` whose direction matches `order.side`
  (buy ↔ `added`/`increased`; sell ↔ `removed`/`reduced`).
- `|matchedQuantityDelta| ≥ order.quantity` → `executed`; `0 < |delta| < quantity` → `partial`;
  no match → `skipped`. Greedy per order on same-symbol collisions.

---

## Aggregate (computed): Scorecard

Produced by `GetSuggestionScorecard`; not stored.

```js
{
  overall: { total, executed, partial, skipped, pending, executionRate },
  byConviction: {
    high:   { total, executed, partial, skipped, pending, executionRate },
    medium: { ... },
    low:    { ... }
  },
  analysesCount,                 // number of completed analyses contributing
  sufficientData: true|false     // false when analysesCount < 3 (FR-013)
}
```
- `executionRate = executed / (executed + partial + skipped)` (excludes `pending`; 0 when denominator 0).
- No outcome/P&L fields (clarified — deferred follow-up).

---

## Storage mapping — `portfolioOrders` table

Existing `_orderToEntity` / `_orderFromEntity` in `AzureAnalysisRepository` extended:

| Entity field | Table column | Serialize | Deserialize |
|---|---|---|---|
| `executionStatus` | `executionStatus` | write the string (omit when `pending` to keep pre-feature rows clean, or always write) | missing → `"pending"` |
| `executionNote` | `executionNote` | write when non-null | missing → `null` |
| `executionUpdatedAt` | `executionUpdatedAt` | write when set | missing → `null` |

- Pre-feature order rows lack these columns → read back as `pending`/null (FR-010).
- The existing `upsert` (delete + rewrite orders) still applies **only** when the date is NOT frozen;
  the freeze guard prevents `upsert` from running on a marked date, so statuses are never lost.

### New repository methods (on `IAnalysisRepository` + `AzureAnalysisRepository`)
- `setOrderExecutionStatus(date, index, { status, note })` — Merge-upsert the status columns on the
  one order row; stamps `executionUpdatedAt`. Throws if the order row does not exist.
- `hasMarkedOrders(date)` — true if any order for `date` has `executionStatus !== 'pending'`.
- `listAllOrders()` — scan `portfolioOrders`, return all `SuggestedOrder`s (for the scorecard).

---

## Relationships
- `WeeklyAnalysis 1—* SuggestedOrder` (existing; orders now carry execution status).
- `SuggestedOrder —(matched against)— positionChanges` (feature 006, read-time proposal only).
- `Scorecard` = aggregation over all `SuggestedOrder`s grouped by `conviction`.
