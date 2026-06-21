# Data Model — Macro Week-over-Week Comparison (feature 012)

All new data is **optional** and additive. Pre-feature analyses and first runs
lack it and MUST remain valid and displayable (FR-006, FR-007, SC-004).

## 1. Computed row shape — `MacroChangeRow`

Produced by `MacroChangeCalculator.diff(priorMacro, currentMacro)`; persisted on
the analysis and rendered as a table.

| Field | Type | Notes |
|---|---|---|
| `key` | string | indicator key (e.g. `bcraReserves`) |
| `label` | string | display label (e.g. "BCRA reserves") |
| `unit` | string | e.g. `bp`, `%`, `USD M` |
| `priorValue` | number | prior reading's value |
| `priorAsOf` | string\|null | prior reading's as-of date |
| `currentValue` | number | current reading's value |
| `currentAsOf` | string\|null | current reading's as-of date |
| `deltaAbs` | number | `currentValue − priorValue` |
| `deltaPct` | number\|null | `(delta / priorValue) × 100`; **null when `priorValue === 0`** (FR-010) |

Inclusion rule: a key is present only when both prior and current readings exist,
are `available !== false`, and have a finite numeric `value` (FR-004). The textual
`imfReviewStatus` is excluded (FR-005).

## 2. `MacroChangeCalculator` (pure domain service)

- `static diff(priorMacro, currentMacro): MacroChangeRow[] | null`
- Returns **null** when `priorMacro` is null/absent (no prior analysis → comparison absent, FR-006).
- Returns **`[]`** when there is a prior panel but no indicator qualifies (rendered as omitted, like an absent section).
- Iterates a `KEY_META` map (the 8 numeric keys → {label, unit}); skips keys not in the map and readings failing the inclusion rule.

## 3. `WeeklyAnalysis` entity addition

| Field | Type | Default | Source |
|---|---|---|---|
| `macroChanges` | `MacroChangeRow[]` \| null | null | code (computed) |

Validation (light, mirroring `positionChanges`/feature-010 fields): `null` = absent
(fine); a present value MUST be an array of objects, else reject. Frozen on
construct. Included in `toJSON`.

## 4. Persistence — `portfolioAnalysis` column

| Column | Written when | Read |
|---|---|---|
| `macroChangesJson` | non-null | `_parseJsonColumn → null` fallback (absent/malformed → null) |

Absent column → null (pre-feature rows). Whole-record `Replace` upsert gives FR-012.

## 5. No other data changes

- No new tables, settings, or tool-schema changes. The macro panel (`macroContext`)
  is unchanged — it is read, not modified. The charts series and the LLM
  `weekOverWeek` field are untouched (FR-013).
