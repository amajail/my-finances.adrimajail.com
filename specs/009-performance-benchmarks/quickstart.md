# Quickstart: Portfolio Growth vs Benchmarks

**Feature**: 009-performance-benchmarks

## Prerequisites
- Functions on `http://localhost:7071/api`; Azurite running; several weekly analyses with
  `portfolioTotals` (feature 006). Prod has ~7 weeks.
- `analysis.fredApiKey` set (for S&P 500 + US CPI levels). Without it those two benchmarks show as
  unavailable; portfolio + MEP + AR CPI still render.

## Verify

1. **Performance endpoint** (benchmark fetch is server-side):
   ```bash
   curl "http://localhost:7071/api/analysis/performance?weeks=52&code=<key>" | jq \
     '.count, .benchmarksAvailable, .points[-1]'
   ```
   - `points` ascending by date; latest point has `portfolioValueUsd`, `mep`, `sp500`, `usCpi`, `arCpi`
     each with `value`/`asOf`/`available`.

2. **Performance page**: open the dashboard (`cd dashboard && npm run dev`) → **Performance** in the nav.
   - The portfolio value line and the MEP line both start at **100** and track over the weeks (works
     with no FRED key — uses only persisted data).
   - Toggle S&P 500 and inflation overlays → they index to 100 and overlay on the same axis.
   - A week where total value jumped (a deposit) shows as a visible step in the portfolio line — it is
     labeled value growth, not a return.
   - Summary shows each series' growth % over the window and the portfolio-vs-benchmark gap.

3. **Range**: pick 8 / 26 / 52 / all → every series **re-indexes to 100** at the new window start and
   redraws.

4. **Resilience**: unset `analysis.fredApiKey` (or block FRED) → S&P + US CPI show unavailable; the
   portfolio, MEP, and AR CPI lines still render (SC-004).

5. **Sparse**: with 0–1 points, a clear "insufficient history" state — no error.

## Tests
```bash
npm run test:unit   # GetPerformanceSeries, BenchmarkAligner.alignOnOrBefore, AR-CPI index builder,
                    # FredProvider.getObservations (mocked), charts.cjs indexTo100
npm test            # full suite (CI parity)
cd dashboard && npm run build   # Astro build incl. the new Performance page
```
Use clearly-fake holdings data in all fixtures (Constitution I).
