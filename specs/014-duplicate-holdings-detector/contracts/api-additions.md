# Contract additions: Cross-broker duplicate-holdings detector

No new endpoints. One additive, optional field on the weekly-analysis detail response. Backward
compatible: absent on pre-feature analyses and when a run has no duplicates.

## `GET /api/analysis/weekly/{date}` — response (additive)

```jsonc
{
  // ... existing fields unchanged ...
  "duplications": [
    {
      "symbol": "DUPE",
      "label": "Example Underlying",
      "placements": [
        { "broker": "BROKER_A", "assetType": "stock",  "quantity": 10, "valueUsd": 1000 },
        { "broker": "BROKER_B", "assetType": "cedear", "quantity": 5,  "valueUsd": 250 }
      ],
      "placementCount": 2,
      "totalValueUsd": 1250
    }
  ]
  // field OMITTED entirely when there are no duplicate groups
}
```

- **Presence**: present only when ≥ 1 duplicate group exists; otherwise omitted.
- **Ordering**: groups sorted by `totalValueUsd` descending, then `symbol` ascending (deterministic).
- **List response** `GET /api/analysis/weekly` (summaries) is unchanged — duplicates are detail-only.

## Example placeholders

All examples use fake placeholders (`DUPE`, `BROKER_A`, `1000`) per Privacy First — never commit
real symbols, quantities, or values.
