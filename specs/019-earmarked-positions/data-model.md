# Data Model: Earmarked positions in the weekly analysis payload

No new table. One new settings key (existing `portfolioSettings` table, free-form key/value —
no schema change) and one new optional section on the existing weekly-analysis aggregate,
reusing the per-position snapshot shape already in use by `administrativePositions`.

## Configuration: `analysis.earmarkedBrokers` (existing `portfolioSettings` table — additive row)

| Field | Type | Notes |
|-------|------|-------|
| `value` | string | Comma-separated broker ids, e.g. `"cash"` or `"cash,otherBroker"`. Whitespace around each id is trimmed. Empty string ⇒ no brokers earmarked (feature can be fully disabled without deleting the row). |

- **Default**: `'cash'` when the settings row is absent, matching today's single reserve broker
  (spec FR-001, User Story 4 Acceptance Scenario 3).
- **Read path**: existing `_getSetting(key, defaultValue)` helper (same one used for
  `analysis.model`, `analysis.maxInputTokens`, etc.) — no new repository method.
- **Write path**: existing generic `PUT /api/settings/{key}` endpoint — no new endpoint (spec
  non-goal: no new API endpoints).

## Entity: `WeeklyAnalysis` (existing — additive change)

New optional field, alongside the existing code-computed/classified sections
(`administrativePositions`, `positionChanges`, `driftByBucket`, `driftByAssetClass`,
`concentrationCaps`, `duplications`):

| Field | Type | Notes |
|-------|------|-------|
| `earmarkedPositions` | `EarmarkedPosition[]` | Positions classified earmarked for this run. `[]` when none / on pre-feature rows (same default-empty convention as `administrativePositions`, not `null`). Frozen on construction. |

- **Validation**: same light validation as `administrativePositions` — every entry must be a
  non-array object (`WeeklyAnalysis._validate`). No cross-field rules.
- **Persistence column**: `earmarkedPositionsJson` on the `portfolioAnalysis` row. Written only
  when the array is non-empty; absent column → field reads back as `[]`.
- **Lifecycle**: recomputed every run from that run's snapshot and the current
  `analysis.earmarkedBrokers` setting; a re-run for the same date upserts (Replace), so a
  section present once but empty on re-run (broker designation changed/cleared, or the position
  closed) is dropped, per spec User Story 4 Acceptance Scenario 2.
- **Failure path**: also captured on `_persistFailed` (spec FR-007), mirroring how
  `administrativePositions`/`duplications` already ride onto the failed-run row.

## Value shape: `EarmarkedPosition`

Reuses the existing `PortfolioSnapshotPosition` typedef — NO new per-position fields, identical
shape to `AdministrativePosition` from feature 013.

| Field | Type | Source |
|-------|------|--------|
| `broker` | string | snapshot `broker` (brokerId) |
| `assetType` | string | snapshot `assetType` |
| `symbol` | string | snapshot `symbol` |
| `quantity` | number | snapshot `quantity` |
| `currency` | string | snapshot `currency` |
| `currentPrice` | number \| null | snapshot `currentPrice` |
| `valueUsd` | number | snapshot `valueUsd` (> 0 by classification) |

## Classification rule (derivation, not stored state — three-way partition, evaluated in order)

```
earmarked        ⇔  broker ∈ earmarkedBrokers  AND  Number(valueUsd) > 0     // checked FIRST
administrative   ⇔  broker ∉ earmarkedBrokers  AND  Number(valueUsd) <= 0    // existing feature-013 rule, evaluated SECOND
investable       ⇔  broker ∉ earmarkedBrokers  AND  Number(valueUsd) >  0    // everything else
```

- Applied once per run to the full open-position snapshot (and, separately, to the prior week's
  stored snapshot before diffing week-over-week changes), producing three pairwise-disjoint
  partitions whose union is the full snapshot.
- Order matters only for *implementation sequencing*, not for the outcome of any single
  position: per spec FR-006/Edge Cases, a ≤ 0 value at an earmarked broker is always
  administrative, never earmarked — the rule above already encodes that (the earmarked branch
  requires `valueUsd > 0`). "Evaluated first" means the code must check earmark-membership
  before running the existing feature-013 administrative filter over the *remaining* positions,
  so a positive-value earmarked position is filtered out before it ever reaches the
  administrative check — preventing the price-outage misclassification bug this feature fixes
  (research.md Decision 1).
- The investable partition (and only the investable partition) is the input to allocation-drift,
  concentration-caps, duplicate-holdings, and position-change computations. The earmarked
  partition is the new section; the administrative partition is unchanged from feature 013.
- No position appears in more than one partition.
