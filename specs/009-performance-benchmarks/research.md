# Phase 0 Research: Portfolio Growth vs Benchmarks (indexed)

**Feature**: 009-performance-benchmarks | **Date**: 2026-06-12

Product clarifications are resolved (no cash-flow log → indexed growth; on-demand benchmark levels;
TWR N/A). The decisions below are the design/architecture choices, grounded in the code.

---

## A. On-demand benchmark levels — SERVER-SIDE (FRED key must not reach the browser)

- **Decision**: A new backend use-case `GetPerformanceSeries` + endpoint `GET /api/analysis/performance`
  fetches benchmark **levels** server-side and returns them aligned to each analysis date, alongside
  the portfolio value + MEP (which come from the persisted weekly totals via `getLatest`).
- **Rationale**: The dashboard ships its function key to the browser, but the **FRED API key must stay
  server-side** (Constitution I — credentials via env only). So the index/CPI fetches cannot run in
  the client. A single backend endpoint also lets us align levels to analysis dates once and keep the
  page simple. The portfolio value (`grandTotalUsd`) and `mepRate` are already persisted (feature 006)
  — no fetch needed for those.
- **Alternatives**: client-side fetch (rejected — would expose the FRED key and hit CORS); two
  endpoints (rejected — one aligned payload is cleaner).

## B. Benchmark level sources

| Benchmark | Source | Method |
|---|---|---|
| S&P 500 | FRED `SP500` (daily index level) | `FredProvider.getObservations('SP500', {start,end})` |
| US inflation (price level) | FRED `CPIAUCSL` (CPI **level**, no `pc1` transform) | `FredProvider.getObservations('CPIAUCSL', {start,end})` |
| Argentina inflation (price level) | argentinadatos `/inflacion` (monthly %) → compounded into a CPI index | `ArgentinaDatosInflationProvider.getSeries()` → build level index |
| MEP (ARS↔USD) | feature 006 `portfolioTotals.mepRate` (persisted) | from `getLatest` — no fetch |
| Portfolio value | feature 006 `portfolioTotals.grandTotalUsd` (persisted) | from `getLatest` — no fetch |

- **Decision**: Extend `FredProvider` with `getObservations(seriesId, {start, end, units})` (range query;
  reuses the existing FRED auth + error handling). Extend `ArgentinaDatosInflationProvider` with
  `getSeries()` (full monthly series); a pure helper builds a cumulative AR CPI **level index** from the
  monthly %s. FRED key read from `analysis.fredApiKey` env (already set in prod).
- **Rationale**: One generic FRED range method serves both US series; the AR CPI index is a small pure
  reduction over the public monthly series. No new providers, no new deps.
- **AR CPI index**: start at 100 at the earliest needed month, multiply by `(1 + monthly%/100)` forward;
  the level for an analysis date is the index of the month on/before it.

## C. Date alignment — nearest level on or before (pure, testable)

- **Decision**: A pure helper `alignOnOrBefore(observations, dates)` (domain service
  `BenchmarkAligner`) maps each analysis date to the most recent benchmark observation with
  `obsDate <= analysisDate`; if none exists (date precedes the series), that point is a gap
  (`available:false`). Carries the observation's own date as the `asOf` (FR-007).
- **Rationale**: Benchmarks update on their own cadence (S&P daily, CPI monthly), so an exact-date
  match is rare; on/before is the correct, honest alignment and keeps gaps explicit.
- **Alternatives**: nearest-either-side (rejected — could use a future reading); interpolation
  (rejected — FR-008 forbids fabricating).

## D. Resilience & performance

- **Decision**: The three benchmark fetches run in **parallel** (`Promise.allSettled`); a failed/absent
  one (e.g. no FRED key) marks that benchmark `available:false` for all dates while the others — and the
  always-present portfolio + MEP — still return. Optional: a short in-process cache keyed by
  `(seriesId, start, end)` to avoid refetching on rapid reloads (noted, not required).
- **Rationale**: Matches feature 006's resilient fan-out; keeps the page within the ~2 s target by
  parallelizing. The portfolio + MEP never fail (persisted), so the page always renders something.

## E. Indexing + charting (client, reuse feature 008)

- **Decision**: All series are indexed to 100 **client-side** at the first available point of the current
  window (re-based on range change — FR-004). Add a pure helper `indexTo100(series)` to
  `dashboard/src/lib/charts.cjs` and a `multiLineSvg(seriesList, opts)` renderer (multiple series on ONE
  shared y-axis — valid because every series starts at 100 — with a legend and distinct colors). Reuse
  `sliceLastN` (range) and the gap handling from feature 008.
- **Rationale**: Indexed series are directly comparable on one axis; this is a small addition to the
  existing hand-rolled SVG module. `indexTo100` is pure and unit-tested; the SVG is visual UI.
- **Alternatives**: dual-axis (unnecessary — indexed series share a scale); a charting library (rejected
  — same reasoning as 008, zero new deps).

## F. No new storage / dependencies

- **Decision**: Zero new tables, zero new stored fields, zero new npm packages. Portfolio value + MEP
  reuse persisted data; benchmark levels are fetched on-demand and not stored.
- **Rationale**: The reframe (no cash-flow log) removed the only piece of new storage the original D2
  would have needed. Clean constitution gate.
