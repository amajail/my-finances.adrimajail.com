# Data Model: Cross-broker duplicate-holdings detector

No new table; one optional section added to the existing weekly-analysis aggregate.

## Entity: `WeeklyAnalysis` (existing — additive change)

| Field | Type | Notes |
|-------|------|-------|
| `duplications` | `DuplicateGroup[]` \| `null` | Duplicate groups for this run. `null` on pre-feature rows; `[]`/null when none. Frozen on construction. |

- **Validation**: same light validation as other optional arrays — when non-null, every entry is a
  non-array object.
- **Persistence column**: `duplicationsJson` on the `portfolioAnalysis` row, written only when
  non-empty; absent column → field reads back as `null`.
- **Lifecycle**: recomputed each run; re-run upserts (Replace); a group present once but absent on
  re-run is dropped.

## Value shape: `DuplicateGroup`

| Field | Type | Notes |
|-------|------|-------|
| `symbol` | string | the shared underlying ticker |
| `label` | string | display label (from snapshot display name if available, else symbol) |
| `placements` | `Placement[]` | the 2+ distinct placements of this underlying |
| `placementCount` | number | `placements.length` (≥ 2) |
| `totalValueUsd` | number | sum of placement `valueUsd` (value-tolerant; ≥ 0) |

## Value shape: `Placement`

Reuses snapshot per-position fields — no new per-position attributes.

| Field | Type | Source |
|-------|------|--------|
| `broker` | string | snapshot `broker` |
| `assetType` | string | snapshot `assetType` |
| `quantity` | number | snapshot `quantity` |
| `valueUsd` | number | snapshot `valueUsd` |

## Detection rule (derivation)

```
groups = snapshot
  .filter(p => not cashLike(p.assetType))           // FR-006
  .groupBy(p => normalize(p.symbol))                 // FR-002
  .map(rows => ({ symbol, placements: distinctBy(rows, (broker, assetType)) }))
  .filter(g => distinctPlacements(g) >= 2)           // FR-001
  .map(addCountAndTotal)
  .sort(byTotalValueUsd desc, then symbol asc)       // FR-005, deterministic tiebreak

result = groups            // [] when none (never null from the detector itself)
```

- A `(broker, assetType)` pair appearing more than once for the same symbol (same instrument at the
  same broker) collapses to a single placement (its quantities/values summed) — it is not, by
  itself, a duplicate.
- Deterministic: identical input → identical groups and order (FR-013, SC-007).
