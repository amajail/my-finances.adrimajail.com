# Research — Macro Week-over-Week Comparison (feature 012)

Phase 0. The spec's decisions were front-loaded; this records the few computation
choices and confirms the feature-006 patterns apply. No `NEEDS CLARIFICATION`.

---

## R1 — Inputs: reuse the captured macro panels (no new data)

**Finding**: `GenerateWeeklyAnalysis` loads `previousAnalysis` (`:181`) and already
reads `previousAnalysis.macroContext` (`:193`). The current run's `macroContext`
is computed earlier in the same run. Both are the feature-006 macro panel object,
keyed by indicator, each reading `{ value, asOf, available }`.

**Decision**: Compute `macroChanges = MacroChangeCalculator.diff(previousAnalysis?.macroContext, macroContext)`,
placed immediately after the existing `positionChanges` line (`:188`). Mirrors
`PositionChangeCalculator.diff(priorSnapshot, currentSnapshot)`.

**Rationale**: Zero new data source (FR-011); the diff is a pure function of two
objects already in hand.

---

## R2 — Which indicators, and their labels

**Decision**: Compare these 8 numeric indicators (key → label, unit), matching the
detail-page `MACRO_GROUPS`:

| key | label | unit |
|---|---|---|
| riesgoPais | Riesgo país | bp |
| fxGap | MEP/official gap | % |
| bcraReserves | BCRA reserves | USD M |
| argInflation | Monthly inflation | % |
| argInterestRate | Policy rate | % |
| usaInflation | CPI (YoY) | % |
| usaInterestRate | Fed funds (upper) | % |
| sp500Drawdown | S&P 500 drawdown | % |

A small `KEY_META` map (key → {label, unit}) lives in the calculator. The textual
`imfReviewStatus` is **not** in the map and is therefore excluded (FR-005).

**Rationale**: An explicit map gives stable labels/units for rendering and is the
single place to extend if a new numeric indicator is added. Only 8 stable keys, so
the small maintenance cost is acceptable.

**Alternatives considered**: generic "include any key whose value is numeric"
(rejected — loses labels/units and would need a separate label source; the explicit
map is clearer and still skips non-numeric keys).

---

## R3 — Skip rules (FR-004)

**Decision**: Include an indicator's row only when, for BOTH prior and current:
the reading exists, `available !== false`, and `value` is a finite number.
Otherwise the indicator is omitted (no zero, no error). If the prior `macroContext`
itself is null/absent (first run, or a pre-feature prior), `diff` returns `null`
(the whole comparison is absent — FR-006).

**Rationale**: Matches the spec's "only indicators present in both weeks" and the
graceful-omission contract used across features 006/010.

---

## R4 — Change math (FR-002, FR-010)

**Decision**: Per included row: `deltaAbs = current − prior`; `deltaPct = prior === 0
? null : ((current − prior) / prior) * 100`, rounded to a sensible precision. Carry
`priorValue`, `priorAsOf`, `currentValue`, `currentAsOf`, plus `label`/`unit`.

**Rationale**: Standard percent change; `null` percent when prior is zero avoids
divide-by-zero while still showing the absolute move (FR-010).

---

## R5 — Persistence + render (reuse feature-006/010 patterns)

**Decision**: Add an optional `macroChanges` field to `WeeklyAnalysis` (null when
absent) with light validation (present → array of objects), serialized as a
`macroChangesJson` column via the existing mapper + `_parseJsonColumn` helper.
Expose `macroChanges` in the `GET /api/analysis/weekly/{date}` response. Render a
new "Macro — week over week" `<section>` on `analysis-detail.astro`, shown only
when present and non-empty, visually distinct from "Changes this week" (positions)
and "Week-over-week (analytical)" (LLM).

**Rationale**: Identical to the shipped feature-006/010 approach; pre-feature rows
stay clean (FR-007/SC-004); whole-record replace gives FR-012.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where do prior/current macro readings come from? | Already loaded in the use case (R1) |
| Which indicators, with what labels? | 8 numeric keys via a `KEY_META` map (R2) |
| When to skip an indicator / the whole section? | Both-sides-available rule; null when no prior (R3) |
| Change math + zero handling? | abs always; pct null when prior=0 (R4) |
| Persistence + render? | feature-006/010 JSON-column + detail-section patterns (R5) |

No `NEEDS CLARIFICATION` markers remain.
