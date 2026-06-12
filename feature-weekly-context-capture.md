# Feature: Weekly Context Capture (Macro Metrics + Portfolio Totals)

> Pre-spec brainstorm. Feeds into Spec Kit (`/speckit-specify`). Not a spec yet — captures
> intent, scope, and open questions so the spec is accurate.
>
> Updated after codebase analysis + decisions (2026-06-11). Aligned with Feature 005
> (editable instructions): there are NO prompt template files anymore — live data goes in the
> user message; behavioral guidance lives in the owner-editable instructions document.

## Problem / Motivation

The weekly rebalance analysis (Feature 002) currently captures **one** macro signal —
Argentina country risk (`riesgoPaisBp`) — and a **per-position** portfolio snapshot. Two gaps:

1. **Macro context is too thin.** One indicator is a poor picture of the regime the portfolio
   is operating in.
2. **Portfolio aggregates are computed but thrown away.** Totals (USD/ARS), unrealized PnL, and
   the MEP rate are calculated at run time (`PortfolioCalculator.summary()`, returned by
   `GetPortfolioSummary` incl. `mepRate`/`mepRateAsOf`) and sent to the LLM inside
   `{{portfolioSummary}}`, but **never persisted** on the `WeeklyAnalysis` record. They can't be
   reliably re-derived from the saved snapshot (it drops ARS-native values, per-position
   unrealized PnL, and the MEP rate used).

We want each weekly analysis to immutably retain the full **context it was made under**: a
fixed panel of macro indicators **and** the portfolio totals snapshot — so history is complete,
the model reasons over richer signals, and the dashboard can show (and later chart) both.

---

## Part A — Macro metrics

Eight additional macro metrics, captured **per weekly run**, plus riesgo país folded into the
same structure (see Decisions):

| Metric | Unit | Meaning |
|---|---|---|
| Riesgo país | bp | Argentina country risk (exists today; folded into macro panel) |
| MEP / official FX gap | % | Spread between MEP (financial) USD and official USD: `(mep − oficial) / oficial × 100` |
| BCRA net reserves | USD millions | Central bank net international reserves |
| ARG monthly inflation | % | Latest INDEC monthly CPI print |
| ARG interest rate | % | **BCRA policy/reference rate** (decided — not TAMAR/BADLAR) |
| USA inflation | % | Latest US CPI print (annual or monthly — to define) |
| USA interest rate | % | Fed funds target rate (upper bound) |
| S&P 500 drawdown from high | % | Current decline from all-time high: `(price − ath) / ath × 100` (≤ 0) |
| IMF review status | text/enum | State of the current IMF program review, derived from last week's IMF/Argentina news (e.g. `pending`, `approved`, `staff-level-agreement`, `none`) |

Per-run snapshots (like `riesgoPaisBp` / `riesgoPaisAsOf` today): the value as read at
generation time, with the date it was current as-of. Part of the immutable analysis record.

### Decisions (locked)

- **Sourcing:** auto-fetch all metrics from public sources each run. No manual entry in the happy path.
- **LLM usage:** inject into the prompt (user message) **and** store **and** display.
- **Missing data:** resilient — if a metric can't be fetched, the run **proceeds**; that metric
  is stored as `null` / `unavailable` and rendered as such. A missing macro metric must **not**
  fail the analysis.
- **Riesgo país unified + non-fatal:** riesgo país becomes one more metric in `macroContext`
  with the same resilience (today `RiesgoPaisFetchError` fails the whole run —
  `GenerateWeeklyAnalysis.js:117-130`; this feature relaxes it). The legacy `riesgoPaisBp` /
  `riesgoPaisAsOf` columns stay populated for backward compat (list page reads them).
- **Trend context:** the previous week's `macroContext` is included in the prompt's
  `previousAnalysis` block so the model reasons about **direction** (gap widening, riesgo país
  falling), not just levels. Nearly free — `_loadPreviousAnalysis` already fetches the full
  prior record.
- **ARG interest rate = BCRA policy/reference rate.**
- **IMF review status = news-derived provider** (see below), not manual entry.

### Sourcing per metric (feasibility — needs research in Phase 0)

| Metric | Source candidate | Confidence | Notes |
|---|---|---|---|
| Riesgo país | `argentinadatos.com` (existing provider) | High | Already built; wrap as non-fatal. |
| FX gap | `dolarapi.com` / `argentinadatos.com` (MEP + oficial) | High | Both legs public; gap is computed. MEP leg can reuse `ArgentinaDatosMepProvider`. |
| ARG monthly inflation | `argentinadatos.com` inflación / INDEC | High | Public monthly CPI series exists. |
| ARG interest rate | BCRA / `argentinadatos.com` tasas (policy rate) | Medium-High | Rate chosen (policy/reference); research which endpoint exposes it. |
| USA inflation | FRED (`CPIAUCSL`) or BLS public API | High | FRED free w/ API key; decide annual vs monthly. |
| USA interest rate | FRED (`DFEDTARU` upper bound) | High | Fed funds target via FRED. |
| S&P 500 drawdown | FRED `SP500` / Stooq / existing price provider | Medium | Need reliable series + ATH definition. |
| BCRA net reserves | BCRA statistics / argentinadatos | **Low** | *Gross* reserves published; **net** is derived. Best-effort; expect `unavailable`; open question whether to fall back to gross. |
| IMF review status | News-derived provider (below) | Medium | New pattern; needs Phase 0 research. |

#### IMF review status — news-derived provider (decided approach)

A provider that looks at **the last week's news** about the IMF–Argentina program and derives
the current review status:

1. **Fetch**: IMF press releases / news for Argentina from the past 7 days. Candidate sources:
   IMF press-release RSS/Atom feed filtered for "Argentina", the IMF Argentina country page,
   or a news API. Prefer the official IMF feed (structured, free, no key).
2. **Classify**: map the week's headlines/snippets to the status enum (`pending`, `approved`,
   `staff-level-agreement`, `disbursement`, `none`/`no-news`). Two options:
   - **Keyword/rule-based** — simple, free, brittle.
   - **Small LLM classification call** (e.g. Haiku) reusing the existing `AnthropicLLMClient`
     infra with a strict enum tool schema — robust, costs fractions of a cent, must respect
     cost caps and the privacy logging rules (no holdings data in this call anyway).
3. **Carry-forward semantics**: most weeks there is no news — the status should likely be
   "no change" and the provider may carry forward the prior week's stored value (read from the
   previous analysis) with its original `asOf`. To decide in spec: carry-forward vs `no-news`.
4. Same resilience contract: any failure → `available: false`, run proceeds.

> Phase 0 research must validate: which IMF feed is reliable, whether rule-based is good
> enough before adding an LLM call, and the carry-forward question.

#### Provider architecture

One **`MacroContextProvider` orchestrator** behind an interface, fanning out to per-source
providers (argentinadatos for ARG metrics, one FRED provider serving multiple series, index
price source, IMF news) with `Promise.allSettled` — each metric independently wrapped with
timeout + typed fetch error, failures mapped to `available: false`. Follows the existing
pattern (`ArgentinaDatosRiesgoPaisProvider` → `IRiesgoPaisProvider`).

---

## Part B — Portfolio totals snapshot

Persist the aggregates that are already computed (`PortfolioCalculator.summary()`) but currently
discarded. Save alongside the existing per-position `portfolioSnapshot`:

| Field | Unit | Source today |
|---|---|---|
| `totalUsd` | USD | `totalByCurrency.USD` |
| `totalArs` | ARS (native) | `totalByCurrency.ARS` |
| `grandTotalUsd` | USD | `grandTotalUsd()` (ARS converted at MEP) |
| `unrealizedPnlUsd` | USD | `unrealizedPnlByCurrency.USD` |
| `unrealizedPnlArs` | ARS (native) | `unrealizedPnlByCurrency.ARS` |
| `costBasisUsd` / `costBasisArs` | USD / ARS | `costBasisByCurrency` (optional) |
| `mepRate` + `mepRateAsOf` | ARS per USD / date | already returned by `GetPortfolioSummary` — **store so figures are reproducible** |

Rationale: with these saved, any historical analysis can show total USD / total ARS / unrealized
of both without re-deriving (currently impossible from the snapshot alone). Also the foundation
for the time-series dashboard in Part C. Confirmed: nothing persists these today — the home
page recomputes the summary live on every view.

### B.2 — Position changes (week-over-week delta)

Show **which positions were added, removed, increased, or reduced** that week. The raw data
exists (per-position `portfolioSnapshot` is persisted every run) but is server-side only —
never returned by the API, never diffed. The model is asked to infer deltas in its narrative,
which is unreliable for arithmetic over a position list.

**Design: compute the diff in code at generation time** (prior snapshot vs current), persist it
as a structured list, render it, and inject it into the prompt:

```json
"positionChanges": [
  { "broker": "BROKER", "assetType": "cedear", "symbol": "SYMBOL",
    "change": "increased", "quantityBefore": 10, "quantityAfter": 15, "deltaQuantity": 5 },
  { "broker": "BROKER", "assetType": "bond", "symbol": "SYMBOL",
    "change": "removed", "quantityBefore": 100, "quantityAfter": 0, "deltaQuantity": -100 }
]
```

- **Quantity-based, not value-based**: only `quantity` deltas count as add/reduce — market
  price moves are not "changes the owner made." Identity key = `broker + assetType + symbol`.
- `change` ∈ `added` (new position) | `removed` (gone/closed) | `increased` | `reduced`.
  Unchanged positions are omitted (empty array = "no changes this week").
- First run / prior run missing snapshot → `positionChanges: null` (unknown), distinct from
  `[]` (known: nothing changed).
- **Prompt injection**: include in the user message so the week-over-week section uses exact
  precomputed numbers instead of inferring them — also strengthens the "was prior order X
  executed?" reasoning, and later feeds D1's scorecard (match suggested orders to actual
  changes mechanically).
- **Rendering**: a "Changes this week" block on the detail page (badge per change type, qty
  before → after); optionally a compact indicator (e.g. "+2 / −1") on the list page.
- API: returned by `GET /api/analysis/weekly/{date}` (and a summary count on the list
  endpoint if the list indicator is wanted). Note this exposes symbols + quantity deltas —
  fine for the private API, consistent with orders already being returned.

---

## Data model (applies to both parts)

Extend the `WeeklyAnalysis` entity / `portfolioAnalysis` table. Leaning a **nested JSON blob**
over flat columns — keeps the table schema stable as indicators are added, and lets each metric
carry its own `asOf` + availability:

```json
{
  "macroContext": {
    "riesgoPais":     { "value": 650,    "asOf": "YYYY-MM-DD", "available": true },
    "fxGap":          { "value": 12.4,   "asOf": "YYYY-MM-DD", "available": true },
    "bcraNetReserves":{ "value": null,   "asOf": null,         "available": false },
    "argInflation":   { "value": 2.1,    "asOf": "YYYY-MM-DD", "available": true },
    "argInterestRate":{ "value": 35.0,   "asOf": "YYYY-MM-DD", "available": true },
    "usaInflation":   { "value": 3.2,    "asOf": "YYYY-MM-DD", "available": true },
    "usaInterestRate":{ "value": 4.5,    "asOf": "YYYY-MM-DD", "available": true },
    "sp500Drawdown":  { "value": -6.8,   "asOf": "YYYY-MM-DD", "available": true },
    "imfReviewStatus":{ "value": "pending", "asOf": "YYYY-MM-DD", "available": true }
  },
  "portfolioTotals": {
    "totalUsd": 0, "totalArs": 0, "grandTotalUsd": 0,
    "unrealizedPnlUsd": 0, "unrealizedPnlArs": 0,
    "mepRate": 0, "mepRateAsOf": "YYYY-MM-DD"
  }
}
```

- Captured at run time, never recomputed — consistent with `portfolioSnapshot` semantics.
- Azure Table column = serialized JSON string, as done elsewhere.
- Legacy `riesgoPaisBp`/`riesgoPaisAsOf` columns mirrored from `macroContext.riesgoPais` for
  backward compat.
- Analyses from before this feature simply lack `macroContext`/`portfolioTotals` — renderers
  must tolerate absence. No `promptVersion` bump needed (see next section); if an explicit
  marker is wanted, a small `contextSchemaVersion` field is the right tool — orthogonal to
  005's `promptVersion`.

---

## LLM prompt integration (aligned with Feature 005)

**Feature 005 retired prompt template files.** The system prompt is now the owner-editable
instructions document used **verbatim** (no placeholder tokens, `promptVersion:
'editable-instructions-v1'`, `instructionsHistoryRowKey` mandatory). Live data is delivered in
the **user message** (`_buildUserMessage`: `## generatedAt`, `## portfolioSummary`,
`## previousAnalysis`, `## riesgoPais`). Therefore:

- Replace the `## riesgoPais` block with a **`## macroContext`** block (riesgo país inside it),
  and add a **`## portfolioTotals`** block (or rely on totals already present in
  `portfolioSummary` — decide in plan; explicit block is clearer).
- Add a **`## positionChanges`** block (precomputed diff from B.2, or `"unknown — first run"`)
  so week-over-week reasoning uses exact numbers, not model-inferred deltas.
- Include the **previous week's `macroContext`** inside the existing `## previousAnalysis`
  JSON so the model reasons about deltas/direction.
- Unavailable metrics injected explicitly as `"unavailable"` (not omitted) so the model knows
  the gap is missing data, not a zero.
- **No template version bump** — there is no template. Signal-weighting guidance (e.g. high FX
  gap → caution on ARS deployment; rising US rates → pressure on long duration; deep S&P
  drawdown → opportunity) belongs in the **editable instructions document**. This feature
  should ship a **suggested instructions snippet** (docs or seed-amendment) the owner can paste
  in via the instructions editor — guidance stays under owner control, consistent with 005.

---

## Rendering (current dashboard)

- **Detail page** (`analysis-detail.astro`): add a "Macro Context" block (grouped ARG / US /
  global, each metric with value, unit, as-of; `unavailable` greyed out), a "Portfolio
  Totals" block (USD/ARS totals + unrealized + MEP), and a "Changes this week" block
  (added/removed/increased/reduced badges with qty before → after). Must tolerate pre-feature
  analyses with no macro/totals/changes data.
- **List page** (`analysis.astro`): optionally surface 1–2 headline metrics (e.g. FX gap, total
  USD) as columns; full set on detail. Keep list lean. (Riesgo país column already exists via
  legacy fields.)
- Endpoints `GET /api/analysis/weekly` and `/weekly/{date}` must include the new fields in their
  response (recall: per-position `portfolioSnapshot` is intentionally NOT returned — macro
  context and portfolio totals SHOULD be).

---

## Part C — Future vision: macro variables time-series dashboard

> Out of scope for this feature's build, but it is **why** Parts A/B persist per-week snapshots.
> Documented here so the data model doesn't paint us into a corner.

**Idea:** a dashboard page plotting each macro variable (and key portfolio totals) over time —
x-axis = week (the analysis `date`), y-axis = the metric's value — to see regime trends and how
the portfolio moved against them.

**Is it a good idea?** Yes, with caveats. It's a cheap, high-value read-only view once the
weekly snapshots exist — the capture feature is the hard part; the chart is mostly presentation.
But naïvely "plot all variables on one XY chart" won't work. Refinements:

- **Mixed units/scales — do NOT share one y-axis.** FX gap (%), inflation (%), interest rates
  (%), reserves (USD millions), drawdown (negative %), total USD vs total ARS — wildly different
  ranges. Use **small multiples** (one mini-chart per metric, shared x-axis) as the default.
  Optionally an "indexed to 100 at start" overlay mode for comparing *shape*, and/or dual-axis
  for at most two series.
- **IMF review status is not numeric** — can't go on a continuous y-axis. Render as an **event
  band / colored timeline strip** along the x-axis (markers when status changes), not a line.
- **Sparse + gappy data.** One point per week, and `available: false` weeks leave holes.
  Decide: connect across gaps, dotted, or break the line. Mark unavailable points distinctly.
  Early on there will be very few points — chart should degrade gracefully (or hide until N≥3).
- **Overlay portfolio vs macro.** The valuable insight is correlation: e.g. total USD line vs
  FX gap, or unrealized PnL vs S&P drawdown. Allow pairing one portfolio series with one macro
  series on a dual-axis view.
- **Date alignment caveat.** Each metric's `asOf` may lag the analysis `date` (e.g. monthly
  inflation). Plot against analysis `date` for simplicity, but surface `asOf` in the tooltip so
  a stale reading isn't misread as "this week's."
- **Data source = the persisted snapshots.** A new read endpoint (e.g.
  `GET /api/analysis/macro-series?from=&to=`) returns `{ date, macroContext, portfolioTotals }[]`
  across analyses — a thin projection over the existing `getLatest`. No new storage.
- **Charting:** confirmed there is **no charting library** in `dashboard/package.json` today
  (tables + Tailwind only). Pick a lightweight client-side lib (uPlot / Chart.js) or hand-rolled
  SVG sparklines when Part C is specced; read-only, no server rendering.

**Open questions for the future spec (not now):** small-multiples vs unified-with-toggles;
which 2–3 metrics deserve the headline overlay; range selector (8/26/52 weeks); whether to also
ingest macro readings on days with no analysis (decoupling the series from weekly runs) — for
now the series is intentionally one-point-per-weekly-analysis.

---

## Part D — Roadmap: follow-on features (after this ships)

> Selected 2026-06-11. Not part of this build — listed so this feature's data model supports
> them. Owner's goals: track portfolio changes, improve gains, adjust with context changes,
> find trends.

### D1. Suggestion scorecard (execution tracking)

Close the loop on `SuggestedOrder`s — today they're write-only artifacts and the model must
*infer* execution from portfolio diffs.

- Add execution status to orders: `executed` | `partial` | `skipped` (+ optional note), set by
  the owner from the analysis detail page (orders are currently immutable; this adds the one
  mutable field).
- Feed facts to the next analysis: `## previousAnalysis` includes per-order execution status —
  no more guessing in the week-over-week section.
- **Scorecard view**: hit rate and P&L of executed vs. skipped suggestions over time, by
  conviction level — measures whether the AI analysis is actually improving gains.
- Needs: order status PATCH endpoint + UI toggle + scorecard computation (uses Part B totals
  and per-position snapshots already persisted).

### D2. Performance vs. benchmarks

Part B's weekly `grandTotalUsd` is a portfolio value time series. Build on it:

- Weekly + cumulative returns; compare against benchmarks **already fetched by Part A**:
  S&P 500, US inflation, ARG inflation, MEP (real returns in both currencies).
- ⚠️ Known complication: deposits/withdrawals distort raw value deltas — requires a simple
  **cash-flow log** (date, amount, currency, broker) to compute time-weighted returns. New
  small table; the one piece of genuinely new storage.
- Data-model guard for THIS feature: persist totals every week even on failed analyses if the
  summary was loaded (a failed LLM call shouldn't lose the week's portfolio data point).

*(Considered, not selected for now: allocation-drift tracking, daily regime-shift triggers,
N-week trend series in the prompt.)*

---

## Failure / resilience behavior

- Each metric fetch is independent and individually wrapped (`Promise.allSettled` in the
  orchestrator). One failing fetch → that metric `available: false`; others still populate.
- The analysis run NEVER fails due to a macro fetch failure — **including riesgo país**, which
  becomes non-fatal (today it fails the run).
- Portfolio totals come from the already-loaded summary (no extra fetch); if the summary itself
  fails the run already fails today — unchanged.
- Fetch failures logged via the existing safe-logging path (no payload echo). If the IMF
  provider uses an LLM classification call, it must respect the same logging rules and cost
  telemetry/caps.

---

## Out of scope (for this iteration)

- The time-series dashboard itself (Part C is vision/data-model guard only).
- Manual editing/annotation of past analyses.
- Alerting on metric thresholds.
- Backfilling macro context / totals onto historical (pre-feature) analyses.
- A general settings-editor UI (settings page stays as-is unless a manual override is added later).

---

## Decisions resolved (were open questions)

- ✅ Riesgo país folded into `macroContext` + non-fatal; legacy columns mirrored.
- ✅ Previous week's macro included in prompt for trend reasoning.
- ✅ ARG interest rate = BCRA policy/reference rate.
- ✅ IMF review status = news-derived provider (last week's IMF/Argentina news → status enum).
- ✅ Data shape = nested `macroContext` / `portfolioTotals` JSON.
- ✅ Per-metric `asOf` (not a single `macroAsOf`).
- ✅ No prompt template bump — 005's editable-instructions regime; ship a suggested
  instructions snippet instead.

## Open questions (to resolve in `/speckit-clarify`)

1. BCRA **net** reserves — accept `unavailable`-heavy best-effort, or fall back to **gross**
   reserves (clearly labeled), or descope to later?
2. IMF provider classification — rule-based keywords vs small LLM call (and carry-forward vs
   `no-news` when the week is quiet)?
3. S&P 500 ATH definition — true all-time high vs. 52-week / rolling high?
4. US inflation — headline annual CPI vs. monthly vs. core?
5. Which totals to persist beyond the core set (cost basis? by-broker? by-asset-type? —
   by-asset-type would serve future allocation-drift charts)?
6. List-page exposure — which (if any) headline metric/total gets a column?
7. Explicit `contextSchemaVersion` field, or just tolerate field absence on old rows?

---

## Affected components (reference)

- `src/domain/entities/WeeklyAnalysis.js` — `macroContext` + `portfolioTotals` +
  `positionChanges` fields/validation
- `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` — orchestrate macro fetch,
  capture totals, diff prior vs current snapshot (B.2), build `## macroContext`/
  `## portfolioTotals`/`## positionChanges` user-message blocks, include prior macro in
  `## previousAnalysis`, relax riesgo país
- `src/domain/services/PortfolioCalculator.js` — totals already computed; expose for capture
- `src/infrastructure/providers/` — `MacroContextProvider` orchestrator + per-source providers
  (argentinadatos rates/inflation/MEP-gap, FRED, S&P series, IMF news) + interfaces
- `src/infrastructure/repositories/AzureAnalysisRepository.js` — persist/read new fields
- `src/functions/getWeeklyAnalysis.js`, `getWeeklyAnalysisList.js` — include in responses
- `dashboard/src/pages/analysis-detail.astro`, `analysis.astro` — render (tolerate absence)
- Owner's instructions document (005) — suggested snippet on weighting macro signals
- Tests: Jest unit tests mirroring `src/` under `tests/unit/` (mock providers like existing
  `GenerateWeeklyAnalysis.test.js` pattern)
- (future) `src/functions/getMacroSeries.js` + a new dashboard page + charting lib — Part C
