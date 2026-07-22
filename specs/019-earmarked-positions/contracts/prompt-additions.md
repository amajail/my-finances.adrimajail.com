# Contract additions: Earmarked positions in the weekly analysis payload

No new HTTP endpoints and no dashboard changes (spec non-goals). Two additive contracts:
(1) a new settings key read/written through the existing generic settings endpoint, and
(2) a new block in the LLM user-message payload sent to Anthropic for each weekly run.

## 1. Settings key (existing `GET|PUT /api/settings/{key}` — no new endpoint)

```jsonc
// GET /api/settings/analysis.earmarkedBrokers
{ "key": "analysis.earmarkedBrokers", "value": "cash" }   // or null if never set

// PUT /api/settings/analysis.earmarkedBrokers
// body: { "value": "cash" }               — single broker (today's default)
// body: { "value": "cash,otherBroker" }   — multiple brokers
// body: { "value": " " }                  — clears the designation entirely (no positions earmarked)
```

- **Default when unset**: treated as `"cash"` by the use case (spec FR-001) — the settings row
  itself may simply not exist; no seed script writes it automatically.
- **Clearing the designation**: use a single space (`" "`), not a literal empty string. The
  underlying settings repository collapses a stored empty string to the same `null` as an absent
  row, so `{ "value": "" }` would be silently treated as "unset" and fall back to the default
  `"cash"` rather than disabling earmarking — a storage-layer quirk discovered during
  implementation, not a feature of this use case.
- **Parsing**: comma-separated, each id trimmed; empty/blank segments dropped.

## 2. LLM user-message payload — new `## earmarkedPositions` block

Added to `GenerateWeeklyAnalysis._buildUserMessage`, positioned alongside the existing optional
blocks (`administrativePositions`, `duplications`, `concentrationCaps`). Backward compatible:
omitted entirely when there are no earmarked positions that run.

```jsonc
// ## earmarkedPositions
// <fixed generic instruction text — exclude from invested-capital reasoning, report as a
//  separate line, never suggest deploying/trimming/selling>
{
  "positions": [
    {
      "broker": "BROKER_A",
      "assetType": "cash",
      "symbol": "USD",
      "quantity": 100000,
      "currency": "USD",
      "currentPrice": null,
      "valueUsd": 100000
    }
  ],
  "totalUsd": 100000
}
// block OMITTED entirely when there are no earmarked positions this run
```

- **`currentHoldings` block (existing)**: earmarked positions are excluded from it, same as
  administrative positions already are — the model never sees an earmarked position appear in
  the ordinary holdings list.
- **Instruction wording**: fixed and generic — MUST NOT name any specific real-world purpose
  (spec FR-009). The owner's editable instructions document is the place for that framing, not
  this block's fixed copy.
- **`positionChanges` block (existing)**: never contains an entry for an earmarked position,
  on either side of the week-over-week diff (spec FR-005).

## Persisted-analysis field (internal — not a public API response, since no dashboard/endpoint changes are in scope)

`WeeklyAnalysis.earmarkedPositions` / `AzureAnalysisRepository`'s `earmarkedPositionsJson`
column carry the same array shown above (minus the fixed instruction text, which is prompt-only)
so a completed or failed run's earmarked total is fully reconstructable from the stored record.
No route currently exposes it to a client; that is out of scope for this feature.

## Example placeholders

All examples above use fake placeholders (`BROKER_A`, round numbers) per Privacy First — never
commit real broker names, symbols, quantities, or values.
