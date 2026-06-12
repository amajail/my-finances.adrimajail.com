# Contracts: HTTP API (feature 007)

One new write route, one new read route, and additive fields on the existing detail route. All
`authLevel: 'function'` (consistent with existing position writes + analysis reads).

---

## PATCH /api/analysis/weekly/{date}/orders/{index} — set execution status (new)

Sets the owner-confirmed execution status on one suggested order. Marking any order non-pending
freezes that week's analysis (FR-004).

Request body:
```jsonc
{ "status": "executed", "note": "filled at Galicia, 12 nominales" }
// status ∈ executed | partial | skipped | pending ; note optional
```

Responses:
- `200` → `{ "date", "index", "executionStatus", "executionNote", "executionUpdatedAt" }`
- `400` → invalid status value / malformed date
- `404` → no such analysis date or order index

Notes: idempotent (Merge on the single order row). Setting `pending` clears a prior mark (can
un-freeze the week if no other order remains marked).

---

## GET /api/analysis/weekly/{date} — detail (extended)

Each order in the `orders[]` array gains execution fields, and pending orders gain a read-time
`proposedStatus` (absent when `positionChanges` is null/unknown):

```jsonc
{
  // ...existing analysis fields (incl. macroContext, portfolioTotals, positionChanges from 006)...
  "orders": [
    {
      "index": 0, "broker": "BROKER", "symbol": "SYMBOL", "side": "buy",
      "quantity": 12, "rationale": "...", "conviction": "high",
      "executionStatus": "pending",          // NEW — pending|executed|partial|skipped
      "executionNote": null,                  // NEW
      "executionUpdatedAt": null,             // NEW
      "proposedStatus": "executed"            // NEW — read-time proposal for pending orders only
    }
  ],
  "frozen": true                              // NEW — any order marked non-pending → week is frozen
}
```
Example values are placeholders, not real holdings.

---

## GET /api/analysis/scorecard — scorecard (new)

Aggregates execution outcomes across all completed analyses, overall and by conviction. No P&L
(clarified).

Response:
```jsonc
{
  "overall":      { "total": 0, "executed": 0, "partial": 0, "skipped": 0, "pending": 0, "executionRate": 0 },
  "byConviction": {
    "high":   { "total": 0, "executed": 0, "partial": 0, "skipped": 0, "pending": 0, "executionRate": 0 },
    "medium": { "total": 0, "executed": 0, "partial": 0, "skipped": 0, "pending": 0, "executionRate": 0 },
    "low":    { "total": 0, "executed": 0, "partial": 0, "skipped": 0, "pending": 0, "executionRate": 0 }
  },
  "analysesCount": 0,
  "sufficientData": false
}
```
`executionRate = executed / (executed + partial + skipped)`; `sufficientData=false` when history is
too short (FR-013) — the dashboard shows counts and an "insufficient data" note.

---

## Internal contract: OrderExecutionMatcher (not HTTP)

Pure domain service. `propose(order, positionChanges) -> 'executed' | 'partial' | 'skipped'`.
See data-model.md. Used by the detail endpoint to annotate `proposedStatus`; unit-tested directly.
