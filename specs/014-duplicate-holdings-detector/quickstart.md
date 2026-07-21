# Quickstart: Cross-broker duplicate-holdings detector

## Prerequisites

- Functions host on `http://localhost:7071` (`npm start`); Azurite for tables.
- A portfolio holding at least one underlying in 2+ placements (e.g. same ETF at two brokers, or
  an ADR + a CEDEAR of the same ticker). Use clearly-fake data locally.

## Build & test

```bash
npm test   # incl. new DuplicateHoldingsDetector.test.js
cd dashboard && npm run build
```

## Run an analysis and inspect

```bash
curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer \
  -H 'Content-Type: application/json' -d '{"input":""}'

curl -s http://localhost:7071/api/analysis/weekly/<date> | jq '.duplications'
```

## Acceptance checks (maps to spec Success Criteria)

1. **SC-001 / SC-002**: For N duplicated underlyings each in 2+ placements, `duplications` has
   exactly N groups, and every placement appears in its group (3-placement case → one group of 3).
2. **SC-003 / SC-007**: Re-running the same input yields byte-identical groups in the same order
   (sorted by `totalValueUsd` desc, then `symbol` asc).
3. **SC-004**: Cash/cash-equivalent holdings produce 0 groups.
4. **SC-005**: A portfolio with no duplicates → `duplications` omitted; detail view shows no section.
5. **SC-006**: Open a pre-feature stored analysis — renders with no duplicates section, no error.
6. **FR-012**: The narrative references but does not re-enumerate the duplicate placements.
7. **Dashboard**: `cd dashboard && npm run dev`, open the analysis detail page — the "Duplicate
   holdings" table appears only when there are duplicates.

## Unit-test focus (DuplicateHoldingsDetector.test.js)

- same symbol at two brokers (same wrapper) → 1 group
- same symbol, two wrappers (e.g. stock + cedear) → 1 group
- same symbol, three placements → 1 group of 3
- all-unique symbols → `[]`
- cash assetType present → excluded
- empty snapshot → `[]`
- ordering: higher combined value sorts first; symbol tiebreak deterministic

## Rollback

Revert the branch; the `duplicationsJson` column is optional and ignored by prior code — no
migration needed.
