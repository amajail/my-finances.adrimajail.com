# Feature Specification: Cross-broker duplicate-holdings detector

**Feature Branch**: `014-duplicate-holdings-detector`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "Deterministic cross-broker duplicate-holdings detector for the weekly analysis — identify the same underlying instrument held across more than one broker or instrument wrapper (e.g. an ADR and a CEDEAR of the same company, or the same ETF at two brokers), compute it in code, and present it as its own section instead of relying on the narrative to spot it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where the same underlying is held more than once (Priority: P1)

The portfolio owner reads the weekly analysis and wants a reliable, complete list of cases
where they hold the *same underlying instrument* in more than one place — across different
brokers, or via different wrappers (e.g. a US-listed share and its local CEDEAR equivalent,
or the same ETF at two brokers). Today this is only surfaced when the narrative happens to
notice it, which is inconsistent week to week.

**Why this priority**: This is the whole feature — a deterministic, every-week-complete list
of duplicate placements that the owner can act on (consolidate, or confirm intentional).

**Independent Test**: Provide a portfolio that holds one underlying in two distinct
placements and confirm the analysis lists exactly that group with both placements; provide a
portfolio with no duplicates and confirm the section is absent.

**Acceptance Scenarios**:

1. **Given** a portfolio holding the same underlying instrument in two or more distinct
   placements (different broker and/or different wrapper), **When** the weekly analysis is
   generated, **Then** a duplicate-holdings group is produced listing every placement of that
   underlying.
2. **Given** a portfolio where every underlying is held in exactly one placement, **When** the
   analysis is generated, **Then** no duplicate-holdings groups are produced.
3. **Given** a portfolio with several duplicated underlyings, **When** the analysis is
   generated, **Then** each duplicated underlying is reported as its own group, and the groups
   are ordered by combined value (largest first).

---

### User Story 2 - Duplicate findings are presented as their own section (Priority: P2)

The owner wants the duplicates rendered as a clear, scannable section of the analysis detail,
separate from the holdings list and the drift tables, showing for each duplicated underlying
the placements (broker + wrapper + quantity + value) and the combined exposure.

**Why this priority**: The detection (Story 1) is only useful if it is presented clearly and
persisted with the analysis. Secondary because it depends on Story 1's data existing.

**Independent Test**: Generate an analysis with a known duplicate and confirm the detail view
shows a duplicate-holdings section listing the placements; with no duplicates confirm the
section is omitted; open a pre-feature analysis and confirm it still renders with no section.

**Acceptance Scenarios**:

1. **Given** a generated analysis containing duplicate groups, **When** the analysis detail is
   viewed, **Then** a distinct "Duplicate holdings" section lists each group and its placements.
2. **Given** a generated analysis with no duplicate groups, **When** the detail is viewed,
   **Then** the duplicate-holdings section is omitted entirely.
3. **Given** an analysis generated before this feature existed, **When** it is viewed, **Then**
   it renders normally with no duplicate-holdings section and no error.

---

### User Story 3 - Narrative defers to the deterministic list (Priority: P3)

Because duplicates are now detected deterministically and shown in their own section, the
generated narrative should not spend effort re-enumerating them as separate review items.

**Why this priority**: Quality and consistency improvement; depends on Stories 1–2 existing.

**Independent Test**: Generate an analysis for a portfolio with a known duplicate and confirm
the narrative does not separately enumerate the duplicate placements as watchlist items.

**Acceptance Scenarios**:

1. **Given** a portfolio with a duplicated underlying, **When** the narrative is generated,
   **Then** it does not re-list the duplicate placements item-by-item (it may still reference
   the deterministic section).

---

### Edge Cases

- **Same underlying, three or more placements**: reported as a single group listing all
  placements, not multiple pairwise groups.
- **Same symbol but genuinely different instruments**: out of scope to disambiguate — matching
  is by the instrument's identifying symbol, which for this portfolio's wrappers (share/ADR/
  CEDEAR) is the same ticker for the same underlying. Documented as an assumption.
- **Cash and cash-equivalent placements** (e.g. an off-system cash reserve also held as cash at
  a broker): excluded from duplicate detection — "cash" is not a duplicated *instrument*.
- **A holding with no recoverable value**: still detectable as a duplicate placement, but its
  contribution to the group's combined value is zero (it should not crash or distort ordering).
- **No prior analysis / first ever run**: duplicates are computed from the *current* portfolio
  only, so this feature works on the very first run (no week-over-week dependency).
- **Re-running the same week's analysis**: the duplicate section is recomputed and replaces the
  prior result for that week; a group present once but not on a later run is dropped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST identify, from the current portfolio, every underlying instrument
  that is held in two or more distinct placements, where a placement is a unique combination of
  broker and instrument wrapper (asset type).
- **FR-002**: The system MUST match placements to the same underlying by the instrument's
  identifying symbol (e.g. a share and its CEDEAR of the same ticker, or the same ETF at two
  brokers count as the same underlying).
- **FR-003**: The system MUST report each duplicated underlying as a single group that lists all
  of its placements with, per placement, the broker, wrapper, quantity, and computed value.
- **FR-004**: The system MUST compute, per group, the number of distinct placements and the
  combined value across placements.
- **FR-005**: The system MUST order duplicate groups by combined value, largest first.
- **FR-006**: The system MUST exclude cash and cash-equivalent holdings from duplicate detection.
- **FR-007**: The system MUST compute duplicates from the current portfolio only, with no
  dependency on a prior analysis (works on the first run).
- **FR-008**: The system MUST capture the duplicate-holdings result as an optional, separately
  identifiable section of the analysis, present only when at least one duplicate group exists.
- **FR-009**: The system MUST persist the duplicate-holdings section alongside the analysis so it
  is available on later retrieval, and MUST omit it when there are no duplicates.
- **FR-010**: Analyses generated before this feature existed MUST continue to load and display
  without the duplicate-holdings section and without error.
- **FR-011**: The analysis detail view MUST present duplicate groups in a clearly separated
  section, distinct from the holdings list and the drift tables, and MUST omit that section when
  there are no duplicate groups.
- **FR-012**: The generated narrative MUST be informed that duplicates are detected
  deterministically and shown separately, so it does not re-enumerate them item-by-item.
- **FR-013**: The detection MUST be deterministic — the same portfolio input always yields the
  same groups in the same order.
- **FR-014**: The feature MUST introduce no new external data source, no new market data, no new
  persisted table, and no change to which pricing/model is used.

### Key Entities *(include if feature involves data)*

- **Duplicate group**: one underlying instrument held in 2+ placements. Attributes: the
  identifying symbol, a display label, the list of placements, the count of distinct placements,
  and the combined value.
- **Placement**: one holding of the underlying at a specific broker via a specific wrapper.
  Attributes: broker, wrapper (asset type), quantity, computed value. Reuses attributes already
  captured for a holding snapshot; no new per-position fields required.
- **Weekly analysis**: gains an optional duplicate-holdings section alongside its existing
  code-computed sections (allocation drift, concentration caps, position changes).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any portfolio with N underlyings each held in 2+ placements, the analysis
  reports exactly N duplicate groups (no misses, no spurious groups).
- **SC-002**: Every placement of a duplicated underlying appears in its group (100% of
  placements accounted for; three-placement cases yield one group of three, not multiple pairs).
- **SC-003**: Groups are ordered by combined value largest-first in 100% of runs (deterministic
  ordering verified on repeated runs of identical input).
- **SC-004**: Cash/cash-equivalent holdings produce 0 duplicate groups.
- **SC-005**: For a portfolio with no duplicated underlyings, 0 groups are produced and the
  detail view omits the section.
- **SC-006**: Pre-existing stored analyses continue to render with no errors and no
  duplicate-holdings section (100% backward-compatible display).
- **SC-007**: The same portfolio input produces byte-identical duplicate groups across repeated
  runs (full determinism).

## Assumptions

- Within this portfolio, the same underlying is identified by a shared symbol/ticker across its
  wrappers (share, ADR, CEDEAR) and across brokers; symbol-based matching is therefore sufficient
  and no external symbol-mapping table is needed.
- A "placement" is uniquely a (broker, wrapper) pair; the same underlying at the same broker via
  the same wrapper is a single placement, not a duplicate.
- Duplicate detection is informational: it drives no suggested orders, charts, or scoring. The
  owner decides whether a duplicate is intentional.
- The existing holdings-snapshot attributes (broker, asset type, symbol, quantity, value,
  display label) are sufficient; no new per-position fields are required.
- This feature mirrors the existing pattern of optional, code-computed analysis sections that are
  persisted with the analysis and rendered as a table; it reuses that mechanism rather than
  introducing a new one.
- If the sibling administrative-positions feature (zero-value exclusion) is also present,
  duplicate detection operates on the investable holdings; this feature does not depend on that
  feature being present and degrades gracefully if it is not.
