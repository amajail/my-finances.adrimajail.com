# Feature Specification: Earmarked positions in the weekly analysis payload

**Feature Branch**: `019-earmarked-positions`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Earmarked positions in the weekly analysis payload: exclude an earmarked reserve broker's cash from invested-capital drift/caps/duplications/position-change tracking, report it as a separate line, never suggest deploying it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Allocation drift and caps measure invested capital only (Priority: P1)

The portfolio owner keeps a cash reserve set aside for a specific real-world purpose (e.g.
a large planned purchase) in a broker that otherwise participates in the portfolio. Today
that reserve either distorts the allocation math (if treated as investable) or disappears
silently into an unrelated "administrative stub" bucket (because its price feed reports
null, which makes its computed value look like zero). Neither is correct: the reserve is
real money, deliberately set aside, and the owner's stated strategy is to measure
allocation drift and concentration caps against invested capital **excluding** it.

**Why this priority**: This is the core correctness fix. Every weekly report currently
either overstates how much capital is deployable, or misclassifies the reserve as a
worthless legacy stub — both undermine every downstream allocation and cap figure in the
report.

**Independent Test**: Generate an analysis for a portfolio containing an earmarked-broker
cash position with positive value, and confirm the allocation-drift breakdown,
concentration-cap evaluation, and cross-broker duplicate-holdings detection all compute as
if that position did not exist, while every other holding's percentages are unchanged.

**Acceptance Scenarios**:

1. **Given** a portfolio with a positive-value cash position in the designated earmarked
   broker, **When** the weekly analysis is generated, **Then** that position is excluded
   from the allocation-drift breakdown, the concentration-cap evaluation, and the
   duplicate-holdings detection.
2. **Given** the same portfolio, **When** the drift breakdown is produced, **Then** the
   allocation percentages for every other holding are identical to what they would be if
   the earmarked position did not exist.
3. **Given** a portfolio with no positions in the earmarked broker, **When** the analysis
   is generated, **Then** behavior is unchanged from today.

---

### User Story 2 - The reserve is reported as its own line, not hidden (Priority: P1)

The owner still needs to see the reserve's current total every week — it is real money
being tracked toward a real goal — just not folded into the investable-capital math. The
analysis should present it as an explicitly labeled, separate figure.

**Why this priority**: Equally critical to User Story 1 — excluding the reserve from drift
math must not make it invisible. Today it either inflates the numbers or vanishes into an
unrelated "legacy stub" listing that says nothing about its real purpose or size.

**Independent Test**: Generate an analysis for a portfolio with an earmarked-broker
position and confirm a distinct, separately labeled figure reports exactly that position's
total; generate one for a portfolio without any such position and confirm the figure is
absent.

**Acceptance Scenarios**:

1. **Given** a portfolio with one or more positive-value positions in the earmarked
   broker, **When** the analysis is generated, **Then** a separate, clearly labeled
   section reports exactly those positions and their combined total.
2. **Given** a portfolio with no earmarked-broker positions, **When** the analysis is
   generated, **Then** that section is omitted entirely.
3. **Given** an earmarked-broker position with zero or negative computed value, **When**
   the analysis is generated, **Then** it is treated as an ordinary administrative /
   non-investable stub (existing behavior), not as an earmarked reserve line — the
   earmark designation only applies to value-bearing positions.

---

### User Story 3 - Week-over-week comparisons stay apples-to-apples (Priority: P2)

The week-over-week position-change comparison should never report the reserve appearing,
disappearing, or changing size as if it were an ordinary portfolio move, because it isn't
part of the invested-capital story the comparison exists to tell.

**Why this priority**: Secondary correctness concern — it prevents a confusing false
signal ("position added/removed") the week the reserve designation changes or the reserve
amount itself moves, but the portfolio's actual investable holdings are unaffected either
way.

**Independent Test**: Generate two consecutive weekly analyses where the earmarked
position's value changes between runs, and confirm the position-change comparison shows
no entry for it in either run.

**Acceptance Scenarios**:

1. **Given** a prior week's snapshot and a current week's snapshot that both include an
   earmarked-broker position, **When** the position-change comparison runs, **Then** no
   added/removed/increased/reduced entry is produced for that position regardless of how
   its value changed.
2. **Given** a prior week's snapshot without an earmarked-broker position and a current
   week's snapshot that includes one (e.g. the designation was just configured), **When**
   the position-change comparison runs, **Then** no "added" entry is produced for it.

---

### User Story 4 - The reserve designation is configurable without a code change (Priority: P3)

The owner needs to be able to change which broker(s) hold an earmarked reserve — or clear
the designation entirely once the reserve's purpose is fulfilled and the money re-enters
the investable pool — without needing a developer to ship new code.

**Why this priority**: Lowest priority because the default behavior (today's single
reserve broker) covers the immediate need; this is about not getting stuck once
circumstances change.

**Independent Test**: Change the earmarked-broker configuration to a different broker (or
to none) and confirm the next analysis run reflects the new designation without any code
changes.

**Acceptance Scenarios**:

1. **Given** the earmarked-broker configuration is changed to a different broker,
   **When** the next analysis is generated, **Then** positions in the newly designated
   broker are excluded per User Stories 1–3, and positions in the previously designated
   broker are treated as ordinary investable holdings.
2. **Given** the earmarked-broker configuration is cleared (no broker designated),
   **When** the next analysis is generated, **Then** no positions are treated as
   earmarked and the separate reserve section is omitted.
3. **Given** no configuration has ever been set, **When** an analysis is generated,
   **Then** the system falls back to today's single default reserve broker.

### Edge Cases

- What happens when the earmarked broker's position value is exactly zero or negative?
  → It is NOT treated as an earmarked reserve; it falls through to the existing
  administrative/non-investable handling (out of scope to change that behavior).
- What happens when the earmarked-broker configuration names a broker with no positions
  at all? → No effect; the separate reserve section is simply omitted that week.
- What happens on a run where the previous week's analysis predates this feature (no
  earmark data recorded)? → The comparison treats the absence as "unknown," consistent
  with how the system already handles other fields introduced after older analyses were
  generated; it must not error or crash.
- What happens when multiple positions across multiple currencies/asset types exist in
  the earmarked broker? → All of them are included in the reserve section and its total,
  not just a single designated position.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow designating one or more brokers as "earmarked,"
  configurable without a code deployment, defaulting to today's single reserve broker
  when unconfigured.
- **FR-002**: The system MUST exclude every positive-value position held at an earmarked
  broker from: allocation-drift computation, concentration-cap evaluation, and
  cross-broker duplicate-holdings detection.
- **FR-003**: The system MUST report earmarked positions (and their combined total) as
  their own distinct, clearly labeled section of the weekly analysis, separate from the
  ordinary holdings list and separate from the existing administrative/non-investable
  listing.
- **FR-004**: The system MUST omit the earmarked-positions section entirely when there
  are no positive-value positions at an earmarked broker that week.
- **FR-005**: The system MUST exclude earmarked positions from the week-over-week
  position-change comparison on both the current and the prior week's side of the
  comparison, so an earmarked position's presence, absence, or value change never
  produces an added/removed/increased/reduced entry.
- **FR-006**: The system MUST continue to classify a zero-or-negative-value position at
  an earmarked broker exactly as it does today (administrative/non-investable), not as an
  earmarked reserve line.
- **FR-007**: The system MUST persist the earmarked-positions data recorded for each
  weekly analysis run, including runs that fail before completion, so historical analyses
  remain fully reconstructable.
- **FR-008**: The generated narrative input MUST instruct that earmarked positions are
  excluded from "invested capital" reasoning, are to be reported as a separate line, and
  must never be suggested as a source of funds to deploy, trim, or sell.
- **FR-009**: The system MUST NOT hardcode any specific real-world purpose (e.g. a named
  purchase or goal) for the earmark designation in fixed, non-owner-editable logic — the
  purpose/framing is the owner's to define in the editable strategy document, not baked
  into the system's core behavior.

### Key Entities

- **Earmarked broker configuration**: The set of broker identifiers currently designated
  as holding earmarked (non-investable-for-allocation-purposes) capital. Owner-editable;
  defaults to the single broker used today.
- **Earmarked position**: A held position at an earmarked broker whose computed value is
  positive. Distinct from an "administrative/non-investable" position (zero-or-negative
  value) — the two classifications are mutually exclusive.
- **Weekly analysis record**: The persisted output of one weekly run; gains a new,
  optional collection of earmarked positions alongside its existing holdings and
  administrative-position data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every weekly analysis reports the correct invested-capital allocation
  drift and concentration-cap figures — verified by comparing figures computed with and
  without an earmarked position present and confirming non-earmarked figures are
  identical.
- **SC-002**: 100% of weekly analyses that include an earmarked-broker position with
  positive value show its total in a distinct, clearly labeled section; 100% of analyses
  with no such position omit that section.
- **SC-003**: Zero week-over-week position-change entries are ever produced for an
  earmarked position, across any combination of prior/current snapshot states.
- **SC-004**: The owner can redesignate or clear the earmarked-broker configuration and
  see the change reflected in the very next analysis run, with no code change required.
- **SC-005**: No suggested action in any generated analysis recommends deploying,
  trimming, or selling an earmarked position.

## Assumptions

- The earmarked designation is applied at the broker level (all positions held at a
  designated broker are earmarked), not at the individual-position level — this matches
  how the current reserve is held (a single dedicated broker/account) and keeps the
  configuration simple.
- "Positive value" uses the same value computation already in place for classifying
  administrative/non-investable positions elsewhere in the system; this feature only
  changes *which bucket* a positive-value position at an earmarked broker falls into, not
  how any value is computed.
- Existing, already-persisted weekly analyses from before this feature are not
  retroactively modified; they simply lack earmarked-position data, consistent with how
  other previously-added optional fields are handled.
- Real-world framing of *why* a broker's holdings are earmarked (e.g. what the reserve is
  ultimately for) belongs in the owner's editable strategy/instructions content, not in
  this feature's fixed logic or specification.
