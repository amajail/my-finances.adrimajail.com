# Research: Administrative / non-investable positions

All Technical Context items were resolved during specify + clarify; no open
NEEDS CLARIFICATION remained. This file records the key design decisions and the
existing-code grounding they rest on.

## Decision 1 — Classification rule: `valueUsd <= 0`

- **Decision**: A position is administrative iff its computed USD value is ≤ 0 (zero OR negative).
- **Rationale**: The owner's explicit definition. It targets legacy/tokenized stubs whose price
  can't be fetched (`marketValue()` → null → `valueUsd` coerced to 0). It deliberately does NOT key
  off "null price", because cash/deposit holdings can have a null price but a real positive value
  (valued from quantity) and MUST stay investable (spec FR-005, SC-004). Negative values are data
  anomalies in this long-only book and are safely set aside (clarify session 2026-06-21).
- **Code grounding**: `Position.marketValue()` returns null when `currentPrice === null`
  (`src/domain/entities/Position.js:275`); `GetPortfolioSummary` coerces a null market value to
  `valueUsd: 0` (`src/application/use-cases/portfolio/GetPortfolioSummary.js:93-95`). So a
  `valueUsd <= 0` test cleanly captures the stub set without re-deriving prices.
- **Alternatives rejected**: (a) "null/0 currentPrice" — wrongly excludes cash/deposit;
  (b) a manual `administrative` status/tag field — adds schema + data entry for no benefit.

## Decision 2 — Where exclusion happens: partition upstream, keep the calculator pure

- **Decision**: Partition the snapshot in `GenerateWeeklyAnalysis` into `investableSnapshot` and
  `administrativePositions`; pass only the investable set to `AllocationDriftCalculator.computeDrift`,
  `AllocationDriftCalculator.computeConcentrationCaps`, and `PositionChangeCalculator.diff`. Do NOT
  add the concept inside the drift calculator.
- **Rationale**: Keeps `AllocationDriftCalculator` a pure function over whatever set it receives
  (Constitution II). Because excluded positions contribute exactly 0 USD, the drift denominator and
  every value-bearing percentage are unchanged (spec FR-004, SC-002) — the only visible effect is
  the disappearance of the stub-driven "Unclassified" row.
- **Code grounding**: drift sums `grandTotal` and per-bucket USD over the passed array
  (`src/domain/services/AllocationDriftCalculator.js:82,89-98`) and emits an `unclassified` row only
  when `unclassifiedUsd > 0` (`:135-147`). Snapshot is built by `_snapshotFromSummary`
  (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:440-454`) and already carries
  `valueUsd` and `currentPrice` per row.
- **Alternatives rejected**: filtering inside `computeDrift` — couples the domain service to the new
  concept and would need the same filter duplicated for concentration caps.

## Decision 3 — Persistence + entity: mirror the feature-006/010 optional-section pattern

- **Decision**: Add an optional `administrativePositions` array to `WeeklyAnalysis`, persisted as an
  `administrativePositionsJson` column written only when non-empty, read back with the existing JSON
  column parser. Omit entirely when empty.
- **Rationale**: Identical shape to `positionChanges` / `driftByBucket` (feature 006/010), so it
  inherits their backward-compat behaviour: pre-feature rows lack the column → field is null → no
  section renders (spec FR-007, FR-008, SC-005).
- **Code grounding**: optional-array fields in `WeeklyAnalysis` constructor/validate/toJSON
  (`src/domain/entities/WeeklyAnalysis.js:89-94,183-200`); column write/read pattern in
  `AzureAnalysisRepository` (`positionChangesJson` to/from entity). Reuse the existing
  `PortfolioSnapshotPosition` typedef for entries (no new per-position fields — spec assumption).

## Decision 4 — Generation input: compact labeled block

- **Decision**: In `_buildUserMessage`, build `## currentHoldings` from the investable set only, and
  add a compact `## administrativePositions` block labeled "excluded zero-value stubs — do not flag
  for review" (clarify session 2026-06-21). Omit the block when there are none.
- **Rationale**: Only a positive, labeled signal reliably stops the model raising these as watchlist
  actions (spec FR-010, SC-006) while still letting it reference them. Token cost is negligible (the
  set is tiny and zero-value). Keeps the input/output token effects aligned with sibling feature 015.
- **Code grounding**: holdings block + section assembly in
  `GenerateWeeklyAnalysis._buildUserMessage` (`:456-544`, currentHoldings at `:491-500`).
