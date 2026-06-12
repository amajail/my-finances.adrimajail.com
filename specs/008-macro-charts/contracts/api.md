# Contracts: HTTP API (feature 008)

One new read-only route. No writes, no changes to existing routes.

---

## GET /api/analysis/macro-series — time-series projection (new)

Projects the persisted macro panel + portfolio totals across analyses, ascending by date, for the
charts page. `authLevel: 'function'` (same as the other analysis reads).

Query params:
- `weeks` (optional) — max number of most-recent analyses to include (default 60, clamped 1–200).
  The range selector (8/26/52/all) is applied client-side over the returned points.

Response `200`:
```jsonc
{
  "count": 6,
  "points": [
    {
      "date": "2026-05-08",
      "macroContext": {
        "riesgoPais":      { "value": 540,  "asOf": "2026-05-08", "available": true },
        "fxGap":           { "value": 1.1,  "asOf": "2026-05-07", "available": true },
        "bcraReserves":    { "value": 46000,"asOf": "2026-05-06", "available": true, "basis": "gross" },
        "imfReviewStatus": { "value": "approved", "asOf": "2026-05-21", "available": true }
        // ...all feature-006 indicator keys; null/unavailable preserved as-is
      },
      "portfolioTotals": {
        "totalUsd": 0, "totalArs": 0, "grandTotalUsd": 0,
        "unrealizedPnlUsd": 0, "unrealizedPnlArs": 0, "mepRate": 0, "mepRateAsOf": "2026-05-08"
      }
    }
    // ...ascending by date; an analysis lacking macro/totals has them as null
  ]
}
```

Notes:
- Ascending by `date` (oldest → newest) — chart-ready.
- Includes failed analyses that still carry macro/totals (feature 006 preserves them on failure).
- Per-position `portfolioSnapshot` is NOT included (internal). Same totals already exposed by the
  detail endpoint — no new privacy surface.
- Example values are placeholders, not real holdings.

---

## Internal: GetMacroSeries use-case (not HTTP)

`execute({ weeks }) -> { points, count }`. Calls `analysisRepository.getLatest(weeks)`, maps each
`WeeklyAnalysis` to `{ date, macroContext, portfolioTotals }`, reverses to ascending order. Pure
projection; unit-tested for ordering, the `weeks` clamp, and tolerance of null macro/totals.
