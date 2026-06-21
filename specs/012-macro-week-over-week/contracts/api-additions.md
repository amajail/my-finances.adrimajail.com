# Contract — API response addition (feature 012)

No new endpoints, no tool-schema change. One existing read endpoint gains one
optional field.

## `GET /api/analysis/weekly/{date}` — analysis detail

Gains an optional `macroChanges` key. `null`/absent on pre-feature analyses and on
first runs (no prior week); an array of comparison rows otherwise.

```jsonc
{
  // …existing fields (status, summary, markdownBody, macroContext,
  //   portfolioTotals, positionChanges, driftByBucket, watchlist,
  //   weekOverWeek, frameworkAmendments, orders, …) unchanged…

  "macroChanges": [
    {
      "key": "bcraReserves",
      "label": "BCRA reserves",
      "unit": "USD M",
      "priorValue": 28100,
      "priorAsOf": "2026-06-06",
      "currentValue": 29050,
      "currentAsOf": "2026-06-13",
      "deltaAbs": 950,
      "deltaPct": 3.38
    },
    {
      "key": "riesgoPais",
      "label": "Riesgo país",
      "unit": "bp",
      "priorValue": 640,
      "priorAsOf": "2026-06-06",
      "currentValue": 595,
      "currentAsOf": "2026-06-13",
      "deltaAbs": -45,
      "deltaPct": -7.03
    }
  ]
}
```

**Consumer contract** (`analysis-detail.astro`): render the "Macro changes this
week" section only when `macroChanges` is a non-empty array; `null`, absent, `[]`,
or malformed → omit the section (no empty shell, no error — FR-008). `deltaPct`
may be `null` (prior value was zero) → show the absolute change and a "—" for
percent.

No change to `PUT`/other endpoints, no tool-schema change, charts endpoint
(`/analysis/macro-series`) unchanged (FR-013).
