# Quickstart: Administrative / non-investable positions

How to build, run, and verify this feature locally.

## Prerequisites

- Functions host on `http://localhost:7071` (`npm start`); Azurite for tables.
- A portfolio containing at least one position whose computed value is ≤ 0 (e.g. a holding with
  no recoverable price). Use clearly-fake data locally; never commit real holdings.

## Build & test

```bash
npm test                      # unit tests, incl. new partition / drift-exclusion tests
cd dashboard && npm run build # ensure the detail page still builds
```

## Run an analysis and inspect

```bash
# Generate (operator-only timer trigger)
curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer \
  -H 'Content-Type: application/json' -d '{"input":""}'

# Inspect the new section + confirm drift is clean
curl -s http://localhost:7071/api/analysis/weekly/<date> \
  | jq '{administrativePositions, driftByBucket, driftByAssetClass}'
```

## Acceptance checks (maps to spec Success Criteria)

1. **SC-001 / SC-002**: For a portfolio with a zero-value stub, `driftByBucket` /
   `driftByAssetClass` contain no `unclassified` row caused by the stub, and value-bearing rows'
   `currentPct` match a baseline run without the stub.
2. **SC-003**: Every zero-value (or negative) holding appears in `administrativePositions`; no
   value-bearing holding appears there.
3. **SC-004**: A holding with `currentPrice: null` but positive `valueUsd` (cash/deposit) is NOT in
   `administrativePositions` and IS counted in drift.
4. **SC-005**: Open a pre-feature stored analysis in the dashboard — it renders with no
   administrative section and no error.
5. **FR-010 / SC-006**: Across runs, the narrative/watchlist no longer raises the stub as an action.
6. **Dashboard**: `cd dashboard && npm run dev`, open the analysis detail page — the
   "Administrative / non-investable" table appears only when there are such positions.

## Rollback

Revert the branch; the `administrativePositionsJson` column is optional and ignored by prior code,
so no data migration is needed.
