# Data Model — Structured Analysis Tables (feature 010)

All new persisted data is **optional** and additive. Pre-feature analyses lack
every field below and MUST remain valid and displayable (FR-003, SC-004).

---

## 1. New input artifact — Allocation Targets (`analysis.allocationTargetsV1`)

A single `portfolioSettings` row (machine-readable) the code-computed sections
read. Real values live only in this runtime row; only a placeholder template is
committed. JSON shape:

```jsonc
{
  "version": 1,
  "buckets": [
    {
      "key": "us",                    // stable id
      "label": "US",
      "classes": [
        {
          "key": "us-etf",
          "label": "US — ETFs",
          "targetPct": 25,            // target share of grand total, %
          "membership": {
            "assetTypes": ["etf"],    // matched if position assetType ∈ list…
            "symbols": [],            // …or symbol ∈ list (symbols win over assetTypes)
            "brokers": ["ibkr"]       // optional narrowing
          }
        }
      ]
    }
  ],
  "concentrationCaps": [
    {
      "label": "SYM_A single-name",
      "scope": "bucket",              // "portfolio" | "bucket"
      "bucketKey": "us",              // required when scope = "bucket"
      "match": { "symbol": "SYM_A" }, // one of: symbol | assetType | classKey | bucketKey
      "softPct": 40,                  // optional
      "hardPct": 50                   // optional (at least one of soft/hard required)
    }
  ]
}
```

**Validation**: `buckets[].classes[].targetPct` are numbers; the class targets
should sum to ~100 (a soft check — log a warning, do not block). Each cap has a
valid `scope`, a single `match` dimension, and at least one of `softPct`/`hardPct`.
Membership: `symbols` take precedence over `assetTypes`; `brokers` narrows.

**Membership resolution (calculator)**: for each position, first class whose
`symbols` contains its symbol; else first class whose `assetTypes` contains its
assetType (and `brokers` empty or contains its broker). Unmatched positions →
synthetic `unclassified` row so weights reconcile to 100%.

---

## 2. Computed row shapes (code-produced; persisted on the analysis)

### DriftRow (used for `driftByBucket[]` and `driftByAssetClass[]`)

| Field | Type | Notes |
|---|---|---|
| `key` | string | bucket or class key |
| `label` | string | display label |
| `targetPct` | number | from the targets doc (bucket = sum of its classes) |
| `currentPct` | number | current USD share of grand total |
| `driftPct` | number | `currentPct − targetPct` (signed) |
| `currentUsd` | number | current USD value (for tooltip/secondary column) |

UI: over-weight = `driftPct > 0`, under-weight = `driftPct < 0`, on-target = `0`
(by sign only — FR-005, Q3).

### ConcentrationCapRow (`concentrationCaps[]`)

| Field | Type | Notes |
|---|---|---|
| `label` | string | what it caps (entity-agnostic — FR-006, Q4) |
| `scope` | string | `portfolio` \| `bucket` |
| `bucketKey` | string\|null | when scope = bucket |
| `softPct` | number\|null | |
| `hardPct` | number\|null | |
| `currentPct` | number | measured level over the scope denominator |
| `breach` | string | `none` \| `soft` \| `hard` (highest exceeded) |

---

## 3. LLM-emitted row shapes (model-produced via tool schema; persisted)

### WatchlistFlag (`watchlist[]`)

| Field | Type | Notes |
|---|---|---|
| `item` | string | flagged holding/topic |
| `trigger` | string | rule or condition that fired |
| `severity` | string (optional) | `info` \| `warn` \| `alert` |

### WeekOverWeekDelta (`weekOverWeek[]`) — analytical, NOT position quantities (FR-012)

| Field | Type | Notes |
|---|---|---|
| `metric` | string | what changed (e.g., "ARG bucket weight", "riesgo-país stance") |
| `prior` | string | prior value (string to allow %, words, numbers) |
| `current` | string | current value |
| `direction` | string | `up` \| `down` \| `flat` |

### FrameworkAmendmentSuggestion (`frameworkAmendments[]`)

| Field | Type | Notes |
|---|---|---|
| `proposal` | string | what to change in the strategic framework |
| `rationale` | string | why |

---

## 4. `WeeklyAnalysis` entity additions

Six new optional accessors + constructor handling, mirroring `macroContext` /
`positionChanges` (`WeeklyAnalysis.js:77-157`):

| Field | Type | Default | Source |
|---|---|---|---|
| `driftByBucket` | `DriftRow[]` \| null | null | code |
| `driftByAssetClass` | `DriftRow[]` \| null | null | code |
| `concentrationCaps` | `ConcentrationCapRow[]` \| null | null | code |
| `watchlist` | `WatchlistFlag[]` \| null | null | LLM |
| `weekOverWeek` | `WeekOverWeekDelta[]` \| null | null | LLM |
| `frameworkAmendments` | `FrameworkAmendmentSuggestion[]` \| null | null | LLM |

**Validation** (light, mirroring feature 006): `null` = absent (fine); a present
value MUST be an array of objects with the required string/number fields, else
reject. `[]` is allowed and treated as "nothing to report" → omitted in UI
(FR-008). All six are frozen on construct.

**Serialization** (`toJSON`): include all six (null when absent).

---

## 5. Persistence — `portfolioAnalysis` entity columns (feature-006 pattern)

| Column | Written when | Read |
|---|---|---|
| `driftByBucketJson` | non-null | `_parseJsonColumn → null` fallback |
| `driftByAssetClassJson` | non-null | same |
| `concentrationCapsJson` | non-null | same |
| `watchlistJson` | non-null | same |
| `weekOverWeekJson` | non-null | same |
| `frameworkAmendmentsJson` | non-null | same |

Absent column → null (pre-feature rows). Malformed JSON → null + warning (page
must not crash — FR-008). Whole-record `Replace` upsert already gives FR-013.

---

## 6. Instruction artifacts (not stored in tables; committed files)

| Artifact | Location | Editable? |
|---|---|---|
| Guardrail preamble | `src/application/use-cases/analysis/prompts/guardrail-preamble-v1.md` | No (committed, prepended at assembly) |
| Editing guide | committed (e.g. same prompts dir or `dashboard` static) | No (owner-facing help) |
| Active instructions **body** | `analysis.instructionsV1` settings row (feature 005) | Yes (unchanged by this feature) |

Effective system prompt = `preamble ⊕ body` (FR-014). Both preamble and guide are
generic/holdings-free (FR-019).
