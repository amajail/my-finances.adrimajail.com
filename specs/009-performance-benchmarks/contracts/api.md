# Contracts: HTTP API (feature 009)

One new read-only route. No writes, no changes to existing routes. Benchmark levels are fetched
**server-side** (the FRED key never reaches the browser).

---

## GET /api/analysis/performance — performance series (new)

Returns the weekly portfolio value + MEP (from persisted totals) and the S&P 500 / US CPI / AR CPI
levels (fetched on-demand) aligned to each analysis date, ascending. `authLevel: 'function'`.

Query params:
- `weeks` (optional) — max most-recent analyses (default 60, clamped 1–200). The range selector
  (8/26/52/all) is applied client-side.

Response `200`:
```jsonc
{
  "count": 6,
  "benchmarksAvailable": { "mep": true, "sp500": true, "usCpi": true, "arCpi": true },
  "points": [
    {
      "date": "2026-05-08",
      "portfolioValueUsd": 100000,
      "mep":   { "value": 1450,    "asOf": "2026-05-08", "available": true },
      "sp500": { "value": 5300.12, "asOf": "2026-05-07", "available": true },
      "usCpi": { "value": 320.4,   "asOf": "2026-04-01", "available": true },
      "arCpi": { "value": 100.0,   "asOf": "2026-04-30", "available": true }
    }
    // ...ascending by date; portfolioValueUsd null on analyses lacking totals
  ]
}
```

Notes:
- Ascending by `date`. Indexing-to-100 happens client-side over the selected window.
- A benchmark whose fetch failed / has no key → `available:false` on every point and
  `benchmarksAvailable.<key> = false` (FR-008). Portfolio value + MEP always come from persisted data.
- Each benchmark `asOf` is the source observation's own date (nearest on/before — FR-007).
- No per-position data; same totals already exposed by the analysis detail / macro-series endpoints —
  no new privacy surface. Example values are placeholders, not real holdings.

---

## Internal: GetPerformanceSeries use-case (not HTTP)

`execute({ weeks }) -> { points, count, benchmarksAvailable }`. Steps:
1. `analysisRepository.getLatest(weeks)` → portfolio value (`grandTotalUsd`) + `mepRate` per date (ascending).
2. In parallel (`Promise.allSettled`): FRED `SP500` levels, FRED `CPIAUCSL` levels, argentinadatos AR CPI
   index — over the date span; a failed source → that benchmark unavailable.
3. `BenchmarkAligner.alignOnOrBefore(levels, dates)` for each benchmark.
4. Assemble the per-date points. Pure alignment + AR-index builder are unit-tested.
