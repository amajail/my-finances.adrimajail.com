# Contract additions: Administrative / non-investable positions

No new endpoints. One additive, optional field on the existing weekly-analysis detail response.
No request shape changes. Backward compatible: the field is absent on pre-feature analyses and
when a run has no administrative positions.

## `GET /api/analysis/weekly/{date}` — response (additive)

New optional top-level field, sitting alongside the existing optional code-computed sections
(`positionChanges`, `driftByBucket`, `driftByAssetClass`, `concentrationCaps`, `watchlist`, …):

```jsonc
{
  // ... existing fields unchanged ...
  "administrativePositions": [
    {
      "broker": "BROKER",
      "assetType": "stock",
      "symbol": "STUB",
      "quantity": 10,
      "currency": "USD",
      "currentPrice": null,
      "valueUsd": 0
    }
  ]
  // field OMITTED entirely when there are no administrative positions
}
```

- **Presence**: present only when the run produced ≥ 1 administrative position; otherwise omitted
  (consistent with how other null optional sections are dropped from responses).
- **Ordering**: positions in snapshot order; no sort guarantee required (informational section).
- **List response** `GET /api/analysis/weekly` (summaries) is unchanged — the administrative
  section is a detail-only field.

## Drift/caps response invariants (unchanged shape, changed content)

- `driftByBucket` / `driftByAssetClass`: for a portfolio containing administrative positions, no
  `unclassified` row is produced *because of* those positions, and every value-bearing row's
  `currentPct` is identical to the pre-feature value (excluded positions contribute 0 USD).
- `concentrationCaps`: evaluated over the investable set only.

## Example placeholders

All examples above use fake placeholders (`BROKER`, `STUB`, `123.45`-style) per Privacy First —
never commit real symbols, quantities, or values.
