# Phase 1 Data Model: Portfolio Growth vs Benchmarks

**Feature**: 009-performance-benchmarks | **Date**: 2026-06-12

Read-only computation over feature 006 data + on-demand benchmark levels. **No new entities, tables,
or stored fields.**

---

## Projection: Performance Series (computed, not stored)

Produced by `GetPerformanceSeries`, ascending by analysis date. Portfolio value + MEP come from the
persisted weekly totals; benchmark levels are fetched and aligned on/before each date.

```js
{
  count: <number>,
  points: [
    {
      date: 'YYYY-MM-DD',                                   // analysis date
      portfolioValueUsd: number | null,                     // feature 006 grandTotalUsd
      mep:        { value: number|null, asOf: string|null, available: boolean },
      sp500:      { value: number|null, asOf: string|null, available: boolean },
      usCpi:      { value: number|null, asOf: string|null, available: boolean },
      arCpi:      { value: number|null, asOf: string|null, available: boolean }
    },
    ...
  ],
  benchmarksAvailable: { mep: bool, sp500: bool, usCpi: bool, arCpi: bool }  // any data at all
}
```

- `portfolioValueUsd` is `null` when an analysis lacks totals (pre-feature-006 / uncaptured).
- Each benchmark reading carries the source observation's own date as `asOf` (FR-007); a date that
  precedes a benchmark's series is `available:false` (gap).

## Benchmark levels (fetched, not stored)

| Key | Source | Notes |
|---|---|---|
| `mep` | feature 006 `portfolioTotals.mepRate` | persisted weekly; never fetched |
| `sp500` | FRED `SP500` | daily index level; ~10yr history |
| `usCpi` | FRED `CPIAUCSL` | CPI **level** (no `pc1`); monthly |
| `arCpi` | argentinadatos `/inflacion` → compounded | monthly %s → cumulative level index |

## Pure helpers (unit-tested)

- `BenchmarkAligner.alignOnOrBefore(observations, dates)` → for each date, the latest observation with
  `obsDate <= date`, else a gap. (`observations` = `[{date, value}]` ascending.)
- AR CPI index builder: `[{date, percent}]` (monthly) → `[{date, value}]` where
  `value_n = value_{n-1} × (1 + percent_n/100)`, anchored at 100.
- `indexTo100(series)` (client, `charts.cjs`): rebase a numeric series so its first available value is
  100 (`v_i / v_0 × 100`); gaps stay null; if no available base, all null.

## Derived (client) — indexed comparison series

For the chart, each of {portfolio, mep, sp500, usCpi, arCpi} becomes an `indexTo100` series over the
current window; all share one y-axis (all start at 100). Summary growth % per series = `last − 100`.

## Relationships
- `Performance Series` = `WeeklyAnalysis.portfolioTotals` (feature 006, value + MEP) + on-demand
  benchmark levels aligned to the same analysis dates. No persistence, no mutation.
