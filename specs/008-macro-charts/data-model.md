# Phase 1 Data Model: Macro Context Time-Series Dashboard

**Feature**: 008-macro-charts | **Date**: 2026-06-12

Read-only projection over existing persisted data (feature 006). **No new entities, tables, or
stored fields.**

---

## Projection: Macro Series (computed, not stored)

Produced by `GetMacroSeries` from `IAnalysisRepository.getLatest(limit)`, ascending by date:

```js
{
  points: [
    {
      date: 'YYYY-MM-DD',                 // analysis date (x-axis key)
      macroContext: { /* feature 006 readings, or null */ },
      portfolioTotals: { /* feature 006 totals, or null */ }
    },
    ...
  ],
  count: <number>
}
```

- `macroContext` reading shape (feature 006, unchanged): `{ value, asOf, available, basis? }` per
  indicator key: `riesgoPais`, `fxGap`, `bcraReserves`, `argInflation`, `argInterestRate`,
  `usaInflation`, `usaInterestRate`, `sp500Drawdown`, `imfReviewStatus`.
- `portfolioTotals` shape (feature 006, unchanged): `totalUsd`, `totalArs`, `grandTotalUsd`,
  `unrealizedPnlUsd`, `unrealizedPnlArs`, `costBasisUsd`, `costBasisArs`, `mepRate`, `mepRateAsOf`.
- Points are included even when `macroContext`/`portfolioTotals` are null (pre-feature-006 or
  uncaptured); the client simply finds no value for those metrics on that date.

## Client-side derived series (in `charts.js`, not persisted)

For a numeric metric key `k`, `buildSeries(points, k)` yields, per point:

```js
{ date, value: number|null, asOf: string|null, available: boolean }
```
- `value` is a real number only when the reading exists, `available !== false`, and the value is
  finite; otherwise `value = null` → a **gap** (path breaks; rendered as an "unavailable" marker,
  never 0).
- Portfolio-total series: `available` is true when the totals object exists and the field is finite.

For the IMF strip, a reducer over points yields change-points:
`[{ date, status }]` where consecutive equal statuses collapse; `unavailable`/absent → `unknown`.

## Chart metric catalogue (client config)

| Group | Key | Unit | Source |
|---|---|---|---|
| Argentina | riesgoPais | bp | macroContext |
| Argentina | fxGap | % | macroContext |
| Argentina | bcraReserves | USD M | macroContext |
| Argentina | argInflation | % | macroContext |
| Argentina | argInterestRate | % | macroContext |
| US | usaInflation | % | macroContext |
| US | usaInterestRate | % | macroContext |
| Global | sp500Drawdown | % | macroContext |
| Program | imfReviewStatus | enum (strip) | macroContext |
| Portfolio | totalUsd | USD | portfolioTotals |
| Portfolio | totalArs | ARS | portfolioTotals |
| Portfolio | unrealizedPnlUsd | USD | portfolioTotals |
| Portfolio | grandTotalUsd | USD | portfolioTotals |

(MEP rate / ARS P&L / cost basis are available in the data but not charted in this iteration —
easy to add as more mini-charts later.)

## Relationships
- `Macro Series` is a time-ordered projection of `WeeklyAnalysis.macroContext` +
  `WeeklyAnalysis.portfolioTotals` (feature 006). No persistence, no mutation.
