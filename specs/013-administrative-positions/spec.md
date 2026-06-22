# Feature Specification: Administrative / non-investable positions

**Feature Branch**: `013-administrative-positions`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "Exclude legacy zero-value positions from the weekly analysis allocation-drift and concentration-cap computations, and surface them in a separate administrative / non-investable section instead."

## Clarifications

### Session 2026-06-21

- Q: How should administrative positions appear in the generation input so the narrative stops flagging them (FR-010)? → A: As their own compact, explicitly-labeled block ("excluded zero-value stubs — do not flag for review"); the model may reference them but must not raise them as actions.
- Q: Should a negative computed value (not just exactly zero) also count as administrative? → A: Yes — any value ≤ 0 (zero or negative) is administrative; in this long-only portfolio a negative value is a data anomaly and is safely set aside.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drift and caps ignore zero-value stub holdings (Priority: P1)

The portfolio owner reads the weekly analysis and wants the allocation-drift and
concentration-cap figures to reflect only positions that actually carry value. Holdings
that have no recoverable market value (e.g. legacy or tokenized stubs whose price can no
longer be fetched) should not appear in the drift breakdown at all — they currently land
in a spurious "Unclassified" row that adds noise without signal.

**Why this priority**: This is the core correctness/clarity fix. Without it, every weekly
report shows a misleading "Unclassified" allocation row driven entirely by valueless
holdings, undermining trust in the drift numbers.

**Independent Test**: Generate an analysis for a portfolio containing at least one
zero-value holding and confirm the drift breakdown contains no "Unclassified" row caused
by that holding, while all percentages for real holdings are unchanged.

**Acceptance Scenarios**:

1. **Given** a portfolio with one or more holdings whose value is zero or unrecoverable,
   **When** the weekly analysis is generated, **Then** those holdings are excluded from the
   allocation-drift breakdown and the concentration-cap evaluation.
2. **Given** the same portfolio, **When** the drift breakdown is produced, **Then** the
   allocation percentages for every value-bearing holding are identical to what they would
   be if the zero-value holdings did not exist.
3. **Given** a portfolio with no zero-value holdings, **When** the analysis is generated,
   **Then** the drift and cap results are unchanged from today's behaviour.

---

### User Story 2 - Zero-value holdings surfaced in their own section (Priority: P2)

The owner still needs visibility that these stub holdings exist (e.g. to remember to close
or reconcile them), just not mixed into the investable allocation math. The analysis should
list them in a clearly separated "Administrative / non-investable" section.

**Why this priority**: Excluding them from drift must not make them invisible — the owner
needs a record of what was set aside and why. Secondary to the core exclusion because the
data is informational, not decision-driving.

**Independent Test**: Generate an analysis for a portfolio with zero-value holdings and
confirm a distinct administrative section lists exactly those holdings; generate one for a
portfolio without any and confirm the section is absent.

**Acceptance Scenarios**:

1. **Given** a portfolio with zero-value holdings, **When** the analysis detail is viewed,
   **Then** a separate "Administrative / non-investable" listing shows exactly those holdings
   (and no value-bearing ones).
2. **Given** a portfolio with no zero-value holdings, **When** the analysis detail is viewed,
   **Then** the administrative section is omitted entirely.
3. **Given** a stored analysis generated before this feature existed, **When** it is viewed,
   **Then** it renders normally with no administrative section and no error.

---

### User Story 3 - Narrative stops flagging the stubs (Priority: P3)

The generated narrative/watchlist should stop repeatedly flagging these zero-value holdings
for review each week, because they are now explicitly categorised as administrative.

**Why this priority**: Quality-of-life improvement to the narrative. Lowest priority because
it depends on the categorisation from Stories 1–2 already being in place.

**Independent Test**: Generate an analysis for a portfolio with a known zero-value holding
and confirm the narrative/watchlist no longer raises it as an item needing review.

**Acceptance Scenarios**:

1. **Given** a portfolio with a zero-value holding, **When** the analysis narrative is
   generated, **Then** that holding is not raised as a watchlist item requiring action.

---

### Edge Cases

- **All holdings zero-value**: the drift breakdown reflects an empty investable set without
  error (no division-by-zero), and every holding appears in the administrative section.
- **No holdings zero-value**: behaviour is identical to today; administrative section omitted.
- **A holding with a null/absent price but real value** (e.g. an off-system cash reserve or a
  deposit valued from quantity): MUST remain investable and counted in drift — it is NOT
  administrative. Administrative status is determined by computed value, not by missing price.
- **A holding that flips between value-bearing and zero-value across weeks**: each week's
  analysis classifies it independently from that week's computed value; no carry-over.
- **Re-running the same week's analysis**: a holding present in the administrative section one
  run but value-bearing on a later run for the same week is reclassified, not duplicated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST classify a held position as "administrative / non-investable"
  when its computed value in the reporting currency is less than or equal to zero (i.e. zero
  OR negative — a negative value is treated as administrative, not as an investable holding).
- **FR-002**: The system MUST exclude administrative positions from the allocation-drift
  breakdown (both the by-bucket and by-asset-class views).
- **FR-003**: The system MUST exclude administrative positions from the concentration-cap
  evaluation.
- **FR-004**: The system MUST NOT alter the allocation percentages of value-bearing positions
  as a result of excluding administrative positions (excluded positions contribute zero value).
- **FR-005**: The system MUST treat a position with no available market price but a positive
  computed value (e.g. cash/deposit valued from quantity) as value-bearing, NOT administrative.
- **FR-006**: The system MUST capture the set of administrative positions for a given analysis
  as an optional, separately identifiable section of that analysis.
- **FR-007**: The system MUST persist the administrative-positions section alongside the
  analysis so it is available when the analysis is later retrieved, and MUST omit it when empty.
- **FR-008**: Analyses generated before this feature existed MUST continue to load and display
  without the administrative section and without error.
- **FR-009**: The analysis detail view MUST present administrative positions in a clearly
  separated section, distinct from the investable holdings and the drift tables, and MUST omit
  that section entirely when there are no administrative positions.
- **FR-010**: The generation input MUST present administrative positions as their own compact,
  explicitly-labeled block ("excluded zero-value stubs — do not flag for review"), separate from
  the investable holdings, so the narrative does not raise them as items requiring review (it may
  still reference them if relevant). When there are no administrative positions, the block is omitted.
- **FR-011**: The feature MUST introduce no new external data source, no new market data, no
  new persisted table, and no change to which pricing/model is used.

### Key Entities *(include if feature involves data)*

- **Administrative position**: a held position classified as non-investable for a given
  analysis because its computed value is ≤ 0. Carries the same descriptive attributes already
  captured for a holding snapshot (broker, asset type, symbol, quantity, currency, computed
  value) so the owner can identify it. Distinguished from investable holdings only by the
  value-based classification; no new attributes are required.
- **Weekly analysis**: gains an optional administrative-positions section in addition to its
  existing code-computed sections (allocation drift, concentration caps, position changes).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any portfolio containing at least one zero-value holding, the allocation-drift
  breakdown contains no "Unclassified" row attributable to those holdings (100% of such rows
  are eliminated).
- **SC-002**: For every value-bearing holding, the reported allocation percentage is identical
  before and after the change (0 percentage-point difference) for the same input portfolio.
- **SC-003**: Every zero-value holding appears in the administrative section, and no
  value-bearing holding appears there (100% classification accuracy by the value rule).
- **SC-004**: A position with no market price but positive value is never classified as
  administrative (0 false positives on cash/deposit-style holdings).
- **SC-005**: Pre-existing stored analyses continue to render with no errors and no
  administrative section (100% backward-compatible display).
- **SC-006**: Across consecutive weekly runs for a portfolio with a persistent zero-value
  holding, the narrative raises that holding as a review item 0 times after the change.

## Assumptions

- "Value-bearing" vs "administrative" is decided solely by the computed value being > 0 vs ≤ 0
  in the reporting currency; no separate manual tag or status field is introduced (consistent
  with the user's stated scope: "valueUsd <= 0, NOT null price").
- The administrative section is informational only; it drives no suggested orders, charts, or
  scoring.
- The existing holdings-snapshot attributes are sufficient to identify an administrative
  position; no new per-position fields are needed.
- This feature is independent of the sibling features (deterministic duplicate-holdings
  detector; analysis token-diet v2) and can be specified, built, tested, and shipped on its own.
- The reporting/valuation convention already used by the weekly analysis (existing currency
  conversion and per-position valuation) is reused unchanged.
