# Contracts: HTTP API additions

**Feature**: 006-weekly-context-capture

Only additive changes to two existing endpoints. No new routes. Both remain
`authLevel: 'function'`. The per-position `portfolioSnapshot` stays internal (unchanged).

---

## GET /api/analysis/weekly/{date} — detail (extended)

Adds three fields to the existing response object (present only when captured; otherwise
absent/null — clients MUST tolerate absence per FR-020). Existing fields unchanged.

```jsonc
{
  // ...existing: date, status, generatedAt, modelUsed, promptVersion, tokensIn,
  //    tokensOut, costUsd, durationMs, instructionsHistoryRowKey, frameworkHistoryRowKey,
  //    summary, markdownBody, riesgoPaisBp, riesgoPaisAsOf, orders[] ...

  "macroContext": {
    "riesgoPais":      { "value": 503,   "asOf": "2026-06-10", "available": true },
    "fxGap":           { "value": 0.3,   "asOf": "2026-06-11", "available": true },
    "bcraReserves":    { "value": 47834, "asOf": "2026-06-09", "available": true, "basis": "gross" },
    "argInflation":    { "value": 2.1,   "asOf": "2026-05-31", "available": true },
    "argInterestRate": { "value": 29.0,  "asOf": "2026-06-10", "available": true },
    "usaInflation":    { "value": 3.1,   "asOf": "2026-05-01", "available": true },
    "usaInterestRate": { "value": 4.5,   "asOf": "2026-06-11", "available": true },
    "sp500Drawdown":   { "value": -2.4,  "asOf": "2026-06-11", "available": true },
    "imfReviewStatus": { "value": "approved", "asOf": "2026-05-21", "available": true }
  },

  "portfolioTotals": {
    "totalUsd": 0, "totalArs": 0, "grandTotalUsd": 0,
    "unrealizedPnlUsd": 0, "unrealizedPnlArs": 0,
    "costBasisUsd": 0, "costBasisArs": 0,
    "mepRate": 0, "mepRateAsOf": "2026-06-11"
  },

  "positionChanges": [
    { "broker": "BROKER", "assetType": "cedear", "symbol": "SYMBOL",
      "change": "increased", "quantityBefore": 10, "quantityAfter": 15, "deltaQuantity": 5 }
  ]
  // positionChanges === null  => unknown (no prior snapshot, e.g. first run)
  // positionChanges === []    => verified no changes this week
}
```

Notes:
- `macroContext` values are numbers except `imfReviewStatus.value` (enum string).
- `available:false` readings still appear, with `value:null` — never omitted (FR-009).
- Example values above are illustrative placeholders, not real holdings.

---

## GET /api/analysis/weekly — list (unchanged in this iteration)

Per spec Assumptions, the list keeps its current columns (it already shows riesgo país via the
legacy fields). No fields added now. A future iteration may add a compact macro/change indicator
without a contract break.

---

## Internal tool contract: IMF status classification

Not an HTTP contract — the Anthropic `tool_use` schema for the FR-022 classification call.
See `contracts/imf-classify-tool.json`. The call input is **public IMF news text only**; no
portfolio data crosses this boundary.
