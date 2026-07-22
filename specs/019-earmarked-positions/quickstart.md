# Quickstart: Earmarked positions in the weekly analysis payload

How to build, run, and verify this feature locally.

## Prerequisites

- Functions host on `http://localhost:7071` (`npm start`); Azurite for tables.
- A portfolio containing at least one position in a broker you'll designate as earmarked, with
  a positive computed value (e.g. a cash position whose price feed reports null but whose value
  is derived from quantity). Use clearly-fake broker ids and amounts locally; never commit real
  holdings.

## Build & test

```bash
npm test   # unit tests, incl. new partition / exclusion / prompt-block / persistence tests
```

## Configure the earmarked broker(s)

```bash
# Set (or leave unset to use the default 'cash')
curl -X PUT http://localhost:7071/api/settings/analysis.earmarkedBrokers \
  -H 'Content-Type: application/json' -d '{"value": "cash"}'

# Clear the designation entirely (no positions earmarked)
curl -X PUT http://localhost:7071/api/settings/analysis.earmarkedBrokers \
  -H 'Content-Type: application/json' -d '{"value": ""}'
```

## Run an analysis and inspect

```bash
# Generate (operator-only timer trigger)
curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer \
  -H 'Content-Type: application/json' -d '{"input":""}'
```

There is no dashboard/API surface for `earmarkedPositions` in this feature (non-goal) — verify
via unit tests and, if needed, direct inspection of the persisted `portfolioAnalysis` row's
`earmarkedPositionsJson` column.

## Acceptance checks (maps to spec Success Criteria)

1. **SC-001**: For a portfolio with a positive-value position at the designated earmarked
   broker, `driftByBucket` / `driftByAssetClass` / concentration caps are identical to a
   baseline run with that position removed entirely.
2. **SC-002**: The earmarked position (and only it) is captured in `earmarkedPositions` with the
   correct combined total; a portfolio with none produces `earmarkedPositions: []` and no prompt
   block.
3. **SC-003**: Across a two-run sequence where the earmarked position's value changes between
   runs, `positionChanges` contains no entry for it in either run.
4. **SC-004**: Changing `analysis.earmarkedBrokers` to a different broker (or clearing it)
   changes which positions are earmarked on the very next run, with no code change.
5. **SC-005**: No `orders[]` entry in any generated analysis targets an earmarked position.
6. **Edge case**: a position at the earmarked broker with `valueUsd <= 0` lands in
   `administrativePositions`, not `earmarkedPositions`.
7. **Backward compatibility**: loading a pre-feature stored analysis (no
   `earmarkedPositionsJson` column) does not error; `earmarkedPositions` reads back as `[]`.

## Rollback

Revert the branch; the `earmarkedPositionsJson` column and `analysis.earmarkedBrokers` settings
row are both optional and ignored by prior code, so no data migration is needed.
