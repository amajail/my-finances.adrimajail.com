# Data Model: Administrative / non-investable positions

No new table and no new external entity. One optional section is added to the existing
weekly-analysis aggregate, reusing the per-position snapshot shape already in use.

## Entity: `WeeklyAnalysis` (existing — additive change)

New optional field, alongside the existing code-computed sections (`positionChanges`,
`driftByBucket`, `driftByAssetClass`, `concentrationCaps`):

| Field | Type | Notes |
|-------|------|-------|
| `administrativePositions` | `AdministrativePosition[]` \| `null` | Positions classified administrative for this run. `null` when none / on pre-feature rows. Frozen on construction. |

- **Validation**: same light validation as the other optional arrays — when non-null, every entry
  is a non-array object (`WeeklyAnalysis._validate`). No cross-field rules.
- **Persistence column**: `administrativePositionsJson` on the `portfolioAnalysis` row. Written only
  when the array is non-empty; absent column → field reads back as `null`.
- **Lifecycle**: recomputed every run from that run's snapshot; a re-run for the same date upserts
  (Replace), so a section present once but empty on re-run is dropped.

## Value shape: `AdministrativePosition`

Reuses the existing `PortfolioSnapshotPosition` typedef — NO new per-position fields.

| Field | Type | Source |
|-------|------|--------|
| `broker` | string | snapshot `broker` (brokerId) |
| `assetType` | string | snapshot `assetType` |
| `symbol` | string | snapshot `symbol` |
| `quantity` | number | snapshot `quantity` |
| `currency` | string | snapshot `currency` |
| `currentPrice` | number \| null | snapshot `currentPrice` (typically null for stubs) |
| `valueUsd` | number | snapshot `valueUsd` (≤ 0 by classification) |

## Classification rule (derivation, not stored state)

```
administrative  ⇔  Number(valueUsd) <= 0     // zero OR negative
investable      ⇔  Number(valueUsd) >  0
```

- Applied once to the run's portfolio snapshot, producing two disjoint partitions whose union is
  the full open-position snapshot.
- The investable partition is the input to allocation-drift, concentration-caps, and
  position-change computations. The administrative partition is the new section.
- No position appears in both partitions; cash/deposit with positive value are investable by rule.
