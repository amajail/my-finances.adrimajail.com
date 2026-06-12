# Phase 1 Data Model: Weekly Context Capture

**Feature**: 006-weekly-context-capture | **Date**: 2026-06-12

Extends existing domain entities and the `portfolioAnalysis` Azure Table. No new tables.

---

## Entity: WeeklyAnalysis (extended)

File: `src/domain/entities/WeeklyAnalysis.js`. New fields added to the constructor, validation,
`toJSON`, and `fromJSON`. Existing fields unchanged.

| New field | Type | Notes |
|---|---|---|
| `macroContext` | `MacroContext \| null` | The 9-indicator panel (below). `null`/absent on pre-feature rows. |
| `portfolioTotals` | `PortfolioTotals \| null` | Aggregate snapshot (below). |
| `positionChanges` | `PositionChange[] \| null` | `null` = unknown (no prior snapshot); `[]` = verified no change; non-empty = changes. |

Mirrors retained for backward compat (FR-011): `riesgoPaisBp` / `riesgoPaisAsOf` continue to
exist and are populated from `macroContext.riesgoPais` when available.

### Validation (additions)
- `macroContext`, if present, MUST be an object whose values are `MacroReading`s (shape below);
  unknown/missing keys tolerated (forward-compatible).
- `portfolioTotals`, if present, MUST have numeric `totalUsd`, `totalArs`, `grandTotalUsd`,
  `unrealizedPnlUsd`, `unrealizedPnlArs`, `costBasisUsd`, `costBasisArs`, `mepRate` (non-negative
  except P&L which may be negative) and a `mepRateAsOf` string or null.
- `positionChanges`: `null` OR an array of valid `PositionChange`. Empty array allowed and
  semantically distinct from `null`.
- All three are OPTIONAL — a `completed` or `failed` analysis is valid without them (resilience;
  failed-before-capture rows may legitimately lack them).

---

## Value object: MacroReading

One reading per indicator.

```js
{
  value: number | string | null,   // string only for imfReviewStatus (enum); number otherwise
  asOf: string | null,             // ISO YYYY-MM-DD the value is current as-of
  available: boolean,              // false => fetch/classify failed and nothing to carry
  basis?: string                   // reserves only: "gross" (FR-008). Omitted for others.
}
```

## Aggregate: MacroContext

Keys (all `MacroReading`). Grouped for display (FR-019) but stored flat:

| Key | Unit | Group | Source |
|---|---|---|---|
| `riesgoPais` | bp (number) | Argentina | argentinadatos (reused provider) |
| `fxGap` | % (number) | Argentina | dolarapi oficial+bolsa |
| `bcraReserves` | USD millions (number) + `basis:"gross"` | Argentina | BCRA v4.0 idVariable 1 |
| `argInflation` | % (number) | Argentina | argentinadatos inflación |
| `argInterestRate` | % (number) | Argentina | BCRA v4.0 idVariable 160 |
| `usaInflation` | % (number) | US | FRED CPIAUCSL units=pc1 |
| `usaInterestRate` | % (number) | US | FRED DFEDTARU |
| `sp500Drawdown` | % (number, ≤ 0) | Global | FRED `SP500` (Stooq ^spx fallback when no FRED key — Stooq now JS-gated) |
| `imfReviewStatus` | enum (string) | Program | IMF RSS + AI classify |

`imfReviewStatus.value` ∈ `none | pending | staff-level-agreement | approved | disbursement | unknown`.
- `unknown` = carried-forward-but-stale (> `imfStalenessWeeks`) or never-known.
- `available:false` = fetch/classify failed with nothing to carry (distinct from `unknown`).

## Aggregate: PortfolioTotals

Captured from `GetPortfolioSummary` output at run time (never recomputed; FR-013):

```js
{
  totalUsd: number,            // totalByCurrency.USD
  totalArs: number,            // totalByCurrency.ARS (native)
  grandTotalUsd: number,       // grandTotalUsd()
  unrealizedPnlUsd: number,    // unrealizedPnlByCurrency.USD (may be negative)
  unrealizedPnlArs: number,    // unrealizedPnlByCurrency.ARS (may be negative)
  costBasisUsd: number,        // costBasisByCurrency.USD
  costBasisArs: number,        // costBasisByCurrency.ARS
  mepRate: number,             // ARS per USD used for conversions
  mepRateAsOf: string | null   // ISO YYYY-MM-DD
}
```

## Value object: PositionChange

```js
{
  broker: string,        // identity \
  assetType: string,     // identity  } match key = broker + assetType + symbol
  symbol: string,        // identity /
  change: "added" | "removed" | "increased" | "reduced",
  quantityBefore: number,   // 0 for "added"
  quantityAfter: number,    // 0 for "removed"
  deltaQuantity: number     // after - before (signed)
}
```

Computed by `PositionChangeCalculator.diff(prior, current)` (pure domain service):
- `prior == null` → return `null` (unknown).
- For each symbol in union of prior+current: classify by quantity delta; `|delta| < 1e-9` → skip.
- Result is `[]` when prior exists but no quantity changed.

---

## Storage mapping — `portfolioAnalysis` table

Existing serialization pattern (JSON string in one column) extended in
`AzureAnalysisRepository`:

| Entity field | Table column | Serialize | Deserialize |
|---|---|---|---|
| `macroContext` | `macroContextJson` | `JSON.stringify(macroContext)` if present | `JSON.parse` w/ try-catch → `null` |
| `portfolioTotals` | `portfolioTotalsJson` | `JSON.stringify(portfolioTotals)` if present | `JSON.parse` w/ try-catch → `null` |
| `positionChanges` | `positionChangesJson` | `JSON.stringify(positionChanges)` — **including `null`** | `JSON.parse`; `undefined`/missing column → `null` |
| `riesgoPaisBp` | `riesgoPaisBp` | (existing) mirror of `macroContext.riesgoPais.value` | (existing) |
| `riesgoPaisAsOf` | `riesgoPaisAsOf` | (existing) mirror | (existing) |

- Columns omitted entirely on pre-feature rows → deserialize to `null` (FR-020).
- `positionChangesJson` must serialize the literal `null` (string `"null"`) so the
  unknown-vs-empty distinction survives a round-trip; a **missing** column also reads as `null`.
- Azure Table per-property 64 KB limit: the macro panel and totals are tiny; `positionChanges`
  is bounded by holdings count (well under limit). No chunking needed (unlike instructions doc).

State transitions: unchanged from feature 002 — one row per Friday, re-run replaces wholesale.
New artifacts are re-captured on each run; `positionChanges` is always computed against the
*previous week's* analysis snapshot, never the row being replaced.

---

## Relationships

- `WeeklyAnalysis 1—1 MacroContext` (embedded JSON)
- `WeeklyAnalysis 1—1 PortfolioTotals` (embedded JSON)
- `WeeklyAnalysis 1—* PositionChange` (embedded JSON array; or null)
- `WeeklyAnalysis 1—* SuggestedOrder` (existing, separate `portfolioOrders` table — unchanged)
