# Research: Dividend & Maturity Calendar (017)

Phase 0 output. All spec-level unknowns resolved; no NEEDS CLARIFICATION remain.

## D1 — Dividend data source & API surface

**Decision**: `yahoo-finance2` (already a dependency, already the price source) via `quoteSummary(symbol, { modules: ['calendarEvents', 'summaryDetail'] })`:
- `calendarEvents.exDividendDate` → dividend ex-date event
- `calendarEvents.dividendDate` → dividend payment event (when present)
- amount estimate per share: `summaryDetail.dividendRate / 4` (annualized rate assumed quarterly) — clearly an estimate per FR-008; when `dividendRate` is absent, emit date-only events.

**Rationale**: zero new dependencies (constitution gate); same egress surface as the existing price refresh (symbols only — no quantities/costs sent). `quoteSummary` is the documented module for forward dividend dates; `quote()` (used by the price provider) does not reliably carry ex-dates.

**Alternatives considered**: IOL connector `get_next_corporate_events` — only available in interactive agent sessions, not to the Functions runtime → rejected for the API path (may enrich sync sessions later). Polygon/Finnhub/etc. — new dependency + API key + constitution amendment for a new egress target → rejected for v1.

## D2 — Which holdings get dividend lookups

**Decision**: open positions with `assetType ∈ {stock, etf}` → full lookup with amount estimates. `assetType = cedear` → lookup the underlying US ticker (CEDEAR symbols in this portfolio match their US underlying) but emit **date-only** events (no amount) because the CEDEAR ratio is not stored (spec assumption). Fixed income, cash, deposits → never looked up.

**Rationale**: matches spec edge case "CEDEARs … when the ratio is unknown, the event shows dates without an amount rather than a wrong number".

**Alternatives**: maintain a CEDEAR-ratio table — new data to curate, low payoff for v1 → deferred.

## D3 — Maturity amount estimation

**Decision**: estimated redemption for a maturity event = the position's **current USD value** as already computed by the portfolio pipeline (`valueUsd`, which applies the per-100-nominales convention via `AssetType.priceFaceValue`). Native amount = `quantity × faceValue/100` in the instrument currency, converted with the same MEP/USD logic the summary uses.

**Rationale**: spec explicitly scopes to "principal-level accuracy"; near maturity, market value converges to redemption value, and reusing `GetPortfolioSummary`'s numbers guarantees consistency with every other page (no second valuation code path).

**Alternatives**: par-value computation (quantity × 100/100) — diverges from displayed values for CER/LECAP capitalization and adds a second convention to maintain → rejected.

## D4 — Dividend lookup caching

**Decision**: none in v1. Lookups run per request, in parallel, each timeboxed (~3 s) with individual failure tolerance; a failed symbol just contributes no events (FR-007 aggregates into the degraded-notice flag when the whole source fails).

**Rationale**: ~20 symbols per request, one user, request frequency measured in per-day units — a cache table is premature and the spec left it as a planning decision. The weekly-analysis path runs once a week.

**Alternatives**: `portfolioSettings`-row cache with TTL — revisit only if Yahoo rate-limits become observable.

## D5 — Weekly-analysis integration

**Decision**: `GenerateWeeklyAnalysis` gains an optional `getCalendarEvents` dep (constructor default `null`), exactly like `allocationTargetsRepository`: when present, fetch a 28-day window; when ≥ 1 event, append a `## upcomingEvents` block (compact JSON: type, date, daysUntil, symbol, broker, estUsd); when empty, absent, or throwing → no block, run proceeds (resilience precedent from features 006/010). Instructions-document guidance for interpreting the block is an owner edit after ship, not part of this feature.

**Rationale**: FR-005 requires omission when empty; the optional-dep pattern keeps every existing test green without mock changes.

## D6 — Endpoint & page conventions

**Decision**: `GET /api/calendar?days=180` (default 180, max 400), `authLevel: 'function'` + the repo's existing local-auth bypass, responses via `_shared.js` `ok/mapError`. Dashboard: `calendar.astro` fetches client-side through `lib/api.js` + the new `lib/load.js` wrapper (feature P2-3), renders month groups as cards (no wide table → `.table-stack` not needed; plain stacked list at all widths), nav link added to `Layout.astro` (10th link — hamburger below `lg` absorbs it; desktop row verified at 1024 px).

**Rationale**: byte-for-byte consistency with the 15 existing endpoints and the 016 responsive patterns.
