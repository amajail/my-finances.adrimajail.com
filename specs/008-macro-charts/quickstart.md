# Quickstart: Macro Context Time-Series Dashboard

**Feature**: 008-macro-charts

## Prerequisites
- Functions on `http://localhost:7071/api`; Azurite running.
- Several weekly analyses on record carrying `macroContext`/`portfolioTotals` (feature 006). Run a
  few analyses for different dates, or rely on the prod data (~6 weeks exist).

## Verify

1. **Series endpoint**:
   ```bash
   curl "http://localhost:7071/api/analysis/macro-series?weeks=52&code=<key>" | jq '.count, .points[0].date, (.points | map(.date))'
   ```
   - `count` matches the analyses with data; `points` are **ascending by date**.

2. **Charts page**: open the dashboard (`cd dashboard && npm run dev`) → **Charts** in the nav.
   - One mini-chart per macro indicator + per portfolio total, all sharing the date axis.
   - Each mini-chart is independently scaled (a thousands-range reserves chart and a near-zero FX
     gap chart both read clearly).
   - Hover a point → value + as-of date shown.
   - A week where an indicator was unavailable shows a distinct gap/marker, not a line through it.
   - IMF status renders as an event strip with markers at status changes.

3. **Overlay**: switch to overlay mode, pick a portfolio series (e.g. total USD) and a macro
   series (e.g. FX gap) → one chart, two vertical axes, shared date axis.

4. **Range selector**: pick 8 / 26 / 52 / all → all charts re-slice to the window.

5. **Sparse/empty**: with 0–1 data points, the page shows a friendly empty / "not enough history"
   state without error.

## Tests
```bash
npm run test:unit   # GetMacroSeries projection + charts.js pure helpers (buildSeries, niceScale, IMF reducer)
npm test            # full suite (CI parity)
cd dashboard && npm run build   # Astro build incl. the new Charts page
```
Use clearly-fake holdings data in all fixtures (Constitution I).
