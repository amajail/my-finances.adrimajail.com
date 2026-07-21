# Research: Cross-broker duplicate-holdings detector

Technical context resolved during specify + clarify; no open NEEDS CLARIFICATION.
Key decisions and the existing-code grounding behind them:

## Decision 1 — Underlying identity = shared `symbol`; placement = `(broker, assetType)`

- **Decision**: Two holdings are the same underlying iff they share the same normalized `symbol`.
  A placement is a unique `(broker, assetType)` pair. A duplicate group is one symbol with ≥ 2
  distinct placements (clarify session 2026-06-21: both cross-broker same-wrapper AND
  cross-wrapper count).
- **Rationale**: In this portfolio the same underlying carries the same ticker across wrappers
  (a share/ADR and its CEDEAR share one ticker, e.g. a placeholder `TICKER`) and across brokers
  (the same ETF). No external
  symbol-mapping table is needed (spec assumption). `(broker, assetType)` cleanly distinguishes an
  ADR-at-IBKR from a CEDEAR-at-BullMarket and the same-ETF-at-two-brokers case.
- **Code grounding**: snapshot rows carry `broker`, `assetType`, `symbol`, `quantity`, `valueUsd`,
  `currentPrice` (`GenerateWeeklyAnalysis._snapshotFromSummary`,
  `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:440-454`). Symbol is already
  normalized/uppercased by the `Symbol` value object.
- **Alternatives rejected**: matching on `displayName` (inconsistent); an explicit underlying-id
  map (over-engineered for a single-user book where tickers already align).

## Decision 2 — Pure stateless service mirroring PositionChangeCalculator/MacroChangeCalculator

- **Decision**: `DuplicateHoldingsDetector.detect(snapshot)` — pure, stateless, no prior needed.
  Returns an array of groups (or `[]`). Deterministic: stable group ordering by combined value desc,
  with a deterministic tiebreak (symbol asc) so identical input → byte-identical output (FR-013, SC-007).
- **Rationale**: Matches feature 006 `PositionChangeCalculator.diff(prior,current)` and feature 012
  `MacroChangeCalculator.diff(prior,current)` conventions (pure static method, array/`null`/`[]`
  return semantics), so reviewers and wiring are familiar. Stateless because duplicates are a
  property of the current portfolio alone — works on the first run (FR-007).
- **Code grounding**: `src/domain/services/PositionChangeCalculator.js` (pure class, keyed diff,
  epsilon for float noise); feature 012 `MacroChangeCalculator` shape in
  `specs/012-macro-week-over-week/data-model.md`.
- **Return semantics**: `[]` when no duplicates (not `null`) — there is no "unknown/first-run" state
  for duplicates, unlike position/macro changes which return `null` when there is no prior.

## Decision 3 — Cash excluded; value-tolerant grouping

- **Decision**: Exclude `cash` and cash-equivalent asset types from detection (FR-006). A placement
  with non-positive value still participates in its group but contributes 0 to combined value and
  must not crash ordering (edge case).
- **Rationale**: "cash" is not a duplicated *instrument*; flagging an off-system reserve plus
  broker cash as a "duplicate" is noise. Value-tolerant summation keeps ordering robust if a
  placement is a zero/again-stub holding.
- **Composition with feature 013**: when present, detection runs on the investable snapshot (013's
  partition), so administrative stubs are already excluded; this feature does not depend on 013 and
  degrades gracefully if absent (runs on the full snapshot).

## Decision 4 — Generation input: compact labeled block

- **Decision**: Add a compact `## duplications` block to `_buildUserMessage` labeled as
  deterministically detected, instructing the model not to re-enumerate the groups item-by-item
  (clarify session 2026-06-21). Omit when there are none.
- **Rationale**: Satisfies FR-012 (narrative defers to the deterministic section) and sets up the
  output-token saving formalized in sibling feature 015. Consistent with feature 013's
  administrative block decision.
- **Code grounding**: section assembly in `GenerateWeeklyAnalysis._buildUserMessage` (`:456-544`).
