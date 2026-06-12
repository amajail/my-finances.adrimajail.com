# Phase 0 Research: Weekly Context Capture

**Feature**: 006-weekly-context-capture | **Date**: 2026-06-12

All external sources verified live (June 2026). This resolves every NEEDS CLARIFICATION /
unknown from the Technical Context. Format per item: Decision / Rationale / Alternatives.

---

## A. Macro indicator sources (the heart of the feature)

### 1. Riesgo país (bp) — REUSE existing provider
- **Decision**: Reuse `ArgentinaDatosRiesgoPaisProvider` (`/v1/finanzas/indices/riesgo-pais/ultimo`, response `{valor, fecha}`). In the orchestrator its failure is **caught and mapped to `available:false`** (per FR-004) instead of aborting the run.
- **Rationale**: Already built and tested; only the fatal→non-fatal behavior changes, and that change lives in the orchestrator, not the provider.
- **Alternatives**: Re-fetch via a new provider — rejected (duplication).

### 2. MEP / official FX gap (%) — dolarapi, new provider
- **Decision**: New `DolarApiFxGapProvider` fetches `https://dolarapi.com/v1/dolares/oficial` and `.../bolsa` (MEP is `casa:"bolsa"`), computes `gap = (bolsa.venta − oficial.venta) / oficial.venta × 100`. as-of = latest `fechaActualizacion` (date part).
- **Rationale**: Keyless, intraday, fields `compra`/`venta` confirmed live. Note: in 2026 the gap is near zero (~0.3%) — that's real data, not a bug.
- **Alternatives**: argentinadatos `/v1/cotizaciones/dolares` (kept as documented fallback URL); reuse existing `ArgentinaDatosMepProvider` for the MEP leg — rejected, it returns only the bolsa leg and we need both legs from one consistent source/timestamp.

### 3. BCRA reserves (USD millions) — GROSS only, BCRA v4.0
- **Decision**: New `BcraMonetariasProvider` (generic BCRA v4.0 client). For reserves use `idVariable 1` ("Reservas Internacionales… en millones de dólares") = **GROSS**. Store with an explicit `basis: "gross"` label (FR-008). **Net reserves are NOT fetched** — no public API exists.
- **Rationale**: Verified live `{"fecha":"2026-06-09","valor":47834.00}`. The clarified FR-008 ("net when obtainable, else labeled gross") resolves in practice to **always gross, labeled**, because net (reservas netas/RIN) is an analyst-computed figure with no feed and methodology-dependent values diverging by billions. Honest labeling beats a fake "net".
- **⚠️ Critical**: Use **v4.0**. The endpoint is `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/{idVariable}`; v3.0 returns HTTP 410 Gone. Observations are nested under `results[0].detalle:[{fecha,valor}]`, newest first.
- **Alternatives**: `api.estadisticasbcra.com` (has reserves but requires a yearly bearer token) — rejected (avoid another secret; official BCRA API is keyless).

### 4. Argentina monthly inflation (%) — argentinadatos, new provider
- **Decision**: New `ArgentinaDatosInflationProvider` hits `/v1/finanzas/indices/inflacion`, takes the latest month-end entry `{fecha, valor}` (monthly % change).
- **Rationale**: Keyless; verified `{"fecha":"2026-05-31","valor":2.1}`. Monthly cadence → as-of lags the run date by weeks (expected; surfaced via as-of date).
- **Alternatives**: `/inflacionInteranual` (YoY) — kept noted; spec assumes monthly headline.

### 5. Argentina policy rate (%) — BCRA v4.0 `idVariable 160`
- **Decision**: Same `BcraMonetariasProvider`, `idVariable 160` ("Tasas de interés de política monetaria", nominal annual %).
- **Rationale**: Authoritative policy/reference rate (owner decision; not BADLAR/TAMAR). Keyless.
- **Alternatives**: argentinadatos `/tasas` (BADLAR/TAMAR-oriented) — rejected for the policy-rate slot.

### 6 & 7. US CPI YoY (%) and Fed funds upper (%) — FRED, new provider + free key
- **Decision**: New `FredProvider` (generic `getLatestObservation(seriesId, {units})`). US inflation = `CPIAUCSL` with `units=pc1` (FRED computes YoY server-side). US rate = `DFEDTARU` (target upper bound). Endpoint `https://api.stlouisfed.org/fred/series/observations?series_id=…&api_key=…&file_type=json&sort_order=desc&limit=1`. `value` is a string; `"."` = missing.
- **Rationale**: Official, reliable, daily. `pc1` avoids us computing YoY. Free API key (32-char), ~120 req/min — ample for weekly use.
- **Key storage**: read from setting `analysis.fredApiKey`, sourced from a Function App Application Setting / `local.settings.json` — **never committed** (FR-023, Constitution I). If the key is absent, FRED-backed indicators return `available:false` (graceful) rather than throwing.
- **Alternatives**: BLS API (US CPI) — viable but second source; FRED covers all three US/global series with one client → preferred.

### 8. S&P 500 drawdown from ATH (%) — Stooq (keyless), new provider
- **Decision**: New `StooqSp500Provider` fetches `https://stooq.com/q/d/l/?s=%5Espx&i=d` (CSV `Date,Open,High,Low,Close,Volume`), computes `drawdown = (lastClose − max(Close)) / max(Close) × 100` (≤ 0). as-of = last row date.
- **Rationale**: Keyless, deep history → **true all-time high**. CSV parsed by line-split (no dependency).
- **Alternatives**: FRED `SP500` (keyed) — only ~10yr window, so ATH not guaranteed true → fallback only. WebFetch can't read the raw CSV (strips non-HTML); implementation must use a real HTTP client (native `fetch`), which is fine at runtime.

### 9. IMF Argentina review status — RSS filter + AI classify
- **Decision**: New `ImfStatusProvider`:
  1. Fetch IMF global news RSS `https://www.imf.org/en/news/rss`.
  2. Filter items from the trailing ~7 days whose title/link/summary contains "argentina" (the press-release slug reliably contains `argentina`, e.g. `pr26165-argentina-…`).
  3. If matches exist → call the **AI classifier** (FR-022) mapping the matched headlines/snippets to the status enum. as-of = newest matched item's date.
  4. If no matches → **carry forward** the prior analysis's IMF reading with its original as-of (FR-007), **unless** that reading is older than **8 weeks**, in which case emit `value:"unknown"`.
  5. Any fetch/classify failure with no prior reading to carry → `available:false`.
- **Rationale**: No structured per-country IMF API exists; a global RSS + local "Argentina" filter is the cleanest verified path, and news→enum is exactly what a small LLM call does well.
- **RSS parsing**: prefer dependency-free tolerant extraction of `<item>` `<title>/<link>/<description>/<pubDate>`; if a parser proves necessary, `fast-xml-parser` is the justified choice (see Complexity Tracking).
- **Alternatives**: HTML-scrape IMF search/country page (brittle); GDELT/NewsAPI (broader but noisier) — kept as documented fallback. Rule-based keyword classification — rejected at clarify (brittle).

### Status enum (finalize)
- **Decision**: `none | pending | staff-level-agreement | approved | disbursement | unknown`.
  `unknown` = carried-forward-but-stale or never-known; `unavailable` (availability flag false) = fetch/classify failure with nothing to carry.

---

## B. AI classification call (FR-022)

- **Decision**: Add a second, small structured call on the existing `AnthropicLLMClient` — a `classify({systemPrompt, userMessage, toolSchema, model, maxTokens})` method mirroring `submitAnalysis`'s tool_use pattern, forced to a single `submit_imf_status` tool returning `{status, asOf}`. Model defaults to **Haiku** (`analysis.imfModel`, default `claude-haiku-4-5-20251001`) for cost.
- **Cost/telemetry**: the call's `usage` (tokensIn/out/costUsd) is returned to the use-case and **added to the run's telemetry**, and counts toward the existing cost-cap accounting. Privacy: the call carries **only public IMF news text** — never holdings (Constitution I carve-out + LLMLogSanitizer applies).
- **Rationale**: Reuses the audited Anthropic path (the only authorized AI egress) and its sanitizer; no new SDK or provider.
- **Alternatives**: a separate cheap model/provider — rejected (would require a new authorized egress + amendment).

---

## C. Provider architecture

- **Decision**: One orchestrator use-case/service `MacroContextProvider` (behind `IMacroContextProvider`) fans out to the per-source providers above via `Promise.allSettled`. Each settled rejection → that indicator `available:false`; the orchestrator never throws. Returns `{ readings: {<key>: MacroReading}, usage }` where `usage` is the IMF classify cost.
- **Rationale**: Matches the existing `IRiesgoPaisProvider`/`IMepProvider` pattern; isolates resilience (FR-004) in one place; keeps `GenerateWeeklyAnalysis` thin (swap the single riesgoPais fetch for one macro fetch).
- **Alternatives**: fetch each indicator inline in the use-case — rejected (fat use-case, scatters the resilience logic).

---

## D. Data model & storage

- **Decision**: Extend the existing `WeeklyAnalysis` entity / `portfolioAnalysis` table with three JSON-serialized columns: `macroContextJson`, `portfolioTotalsJson`, `positionChangesJson` (mirrors how `portfolioSnapshotJson` is already stored). No new table. `riesgoPaisBp`/`riesgoPaisAsOf` columns stay populated, mirrored from `macroContext.riesgoPais` (FR-011).
- **positionChanges sentinel**: store `null` when the prior snapshot is unavailable ("unknown"), `[]` when verified no changes. Deserialize preserving the null/[] distinction (FR-017).
- **No schema-version field**: renderers/readers tolerate absence of the new columns on pre-feature rows (FR-020). Adding a `contextSchemaVersion` was considered and rejected as unnecessary (presence detection suffices).
- **Rationale**: Azure Tables is schemaless per-row; JSON-in-a-column is the established pattern here and keeps the table stable as indicators grow.
- **Alternatives**: flat columns per metric (rejected — churns schema, ~25 new columns); a separate `portfolioMacro` table keyed by date (rejected — needless join; one analysis row already is the aggregate).

---

## E. Position-change computation

- **Decision**: Pure domain service `PositionChangeCalculator.diff(priorSnapshot, currentSnapshot)`. Match by `broker + assetType + symbol`; classify by quantity delta only (`added`/`removed`/`increased`/`reduced`); ignore deltas with absolute value below a tiny epsilon (1e-9) to avoid float artifacts; omit unchanged. Returns `null` if `priorSnapshot` is null/absent.
- **Rationale**: Price-only moves never change quantity, so quantity-based diffing satisfies SC-005 by construction. Pure function → trivially unit-testable.
- **Prior snapshot source**: the most recent prior analysis (any status) that actually has a `portfolioSnapshot`; if none, `null`/unknown (mirrors existing `_loadPreviousAnalysis` fallback).

---

## F. Configuration / secrets

- `analysis.fredApiKey` — FRED key (App Setting / local.settings.json; never committed).
- `analysis.imfModel` — default `claude-haiku-4-5-20251001`.
- `analysis.imfStalenessWeeks` — default `8` (carry-forward cap).
- All read via the existing `AzureSettingsRepository.get()` with code defaults (graceful when unset).

---

## G. New runtime dependencies

- **Decision**: Target **zero** new npm packages. Native `fetch` (Node ≥18) for all HTTP; CSV via line-split; RSS via tolerant string extraction. `fast-xml-parser` is the **only** sanctioned fallback if RSS extraction proves too brittle in testing — justified in Complexity Tracking if adopted.
- **Rationale**: Constitution requires justifying new runtime deps; none are strictly necessary.
