# Feature Specification: Sustained Macro Triggers

**Feature Branch**: `021-sustained-macro-triggers`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Give the weekly analysis the history it needs to evaluate 'sustained 30d' macro triggers. Framework v3.1 §5 has triggers like 'EMBI+ > 800 bp sustained 30d' (also BCRA net reserves < 0 sustained 30d, MEP gap > 50% sustained 30d). The analysis only receives the current macro panel plus the change since the prior run, so these triggers cannot be marked FIRED and an 800 bp trim would never be proposed on its own. For each indicator with a 'sustained Nd' trigger, compute from stored prior analyses how many consecutive days the condition has held, and give that to the analysis next to the current reading. The analysis reports FIRED only when the framework's duration is met. Weeks with unavailable data count as unknown, not as breaks."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A sustained breach fires its trigger (Priority: P1)

As the portfolio owner, I want the weekly analysis to know how long a macro condition has persisted, so a trigger such as "country risk above 800 bp sustained 30 days" is marked FIRED once the condition has held for 30 days and the framework's prescribed action (for example a trim) is proposed without my intervention.

**Why this priority**: This is the whole point of the feature. Today a sustained-duration trigger can never be evaluated, so the analysis can never propose the action the framework prescribes for it.

**Independent Test**: Seed prior analyses whose macro panels show country risk above 800 bp across more than 30 days, run the analysis, and confirm the trigger is reported FIRED with the number of days the condition has held shown beside the current reading.

**Acceptance Scenarios**:

1. **Given** prior analyses show country risk above 800 bp continuously for 35 days and the current reading is also above 800 bp, **When** the weekly analysis runs, **Then** the analysis input shows the current reading with "held 35 days (threshold 30)" and the trigger is reported FIRED.
2. **Given** the condition has held for only 14 days, **When** the analysis runs, **Then** the input shows "held 14 days (threshold 30)" and the trigger is reported NOT FIRED, with the days remaining visible.
3. **Given** the current reading no longer satisfies the condition, **When** the analysis runs, **Then** the held-days count is 0 and the trigger is NOT FIRED, whatever the earlier history.

---

### User Story 2 - Missing data is unknown, never a reset (Priority: P1)

As the owner, I want a week where an indicator could not be fetched to be treated as "unknown" rather than as proof the condition stopped holding, so a transient data outage does not silently reset a 25-day streak back to zero.

**Why this priority**: Macro sources fail regularly. If outages counted as breaks, triggers would almost never reach 30 days and the feature would look like it works while never firing.

**Independent Test**: Seed a history where the condition holds, one week has the indicator unavailable, and the condition holds again afterwards; confirm the streak continues across the gap and the gap is disclosed.

**Acceptance Scenarios**:

1. **Given** the condition held in the weeks before and after a week with unavailable data, **When** the day count is computed, **Then** the streak continues across the gap and the output states that part of the span rests on unknown data.
2. **Given** the only evidence of the condition ending is a week with unavailable data, **When** the day count is computed, **Then** that week is not treated as a break.
3. **Given** a streak that reaches the threshold only by bridging unknown weeks, **When** the analysis runs, **Then** the trigger is still evaluable, and the analysis is told the span includes unverified days so it can say so.

---

### User Story 3 - First run and thin history behave sensibly (Priority: P2)

As the owner, I want the first run, or any run with too little history, to say plainly that the duration cannot be established yet, instead of inventing a count or failing.

**Why this priority**: A new environment or an empty store must not crash the analysis or produce a false FIRED.

**Independent Test**: Run the analysis with no prior analyses and confirm it completes, every sustained trigger shows only the current reading with "no history", and none is FIRED.

**Acceptance Scenarios**:

1. **Given** no prior analyses exist, **When** the analysis runs, **Then** each sustained trigger shows the current reading, a held-days count of at most the current observation, and "insufficient history", and none is FIRED.
2. **Given** history covers only 10 days of a 30-day trigger, **When** the analysis runs, **Then** the trigger is NOT FIRED and states that history is shorter than the required window.

---

### Edge Cases

- A reading exactly equal to the threshold: the comparison follows the framework's wording ("above" is strict).
- The current reading is unavailable: held-days is unknown, the trigger cannot be FIRED, and this is stated.
- Prior analyses that failed or hold no macro panel contribute no observations; they are not breaks.
- A failed analysis row in the history does not abort the day count.
- Two prior analyses on the same date: one observation per date is used.
- Streak longer than the stored history: the count is capped at what history proves and flagged as a lower bound.
- A value that crosses the threshold and returns between two observations cannot be seen; the count assumes the condition held between consecutive satisfying observations.
- Indicators without a "sustained Nd" trigger are unaffected and add nothing to the input.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST know, for each sustained-duration trigger in framework v3.1 §5, the indicator, comparison, threshold, and required duration in days. At minimum: country risk above 800 bp for 30 days, BCRA net reserves below 0 for 30 days, and MEP/official gap above 50% for 30 days.
- **FR-002**: For each such trigger, the system MUST compute from stored prior analyses how many consecutive days, ending at the current reading, the condition has held.
- **FR-003**: The computation MUST be done deterministically by the system, never delegated to the analysis model.
- **FR-004**: The system MUST present each trigger's held-days count, threshold duration, and whether the duration is met immediately next to that indicator's current reading in the analysis input.
- **FR-005**: The analysis MUST report a sustained trigger as FIRED only when the condition holds on the current reading AND the required duration is met. A duration not yet met MUST NOT be reported FIRED.
- **FR-006**: A prior week whose indicator reading is unavailable MUST count as unknown, not as a break: it MUST NOT reset the streak.
- **FR-007**: When a count rests partly on unknown weeks, the system MUST flag it so the analysis can state the span includes unverified days.
- **FR-008**: When the current reading does not satisfy the condition, the held-days count MUST be 0.
- **FR-009**: With no prior analyses, the system MUST still complete the run, mark each sustained trigger as having insufficient history, and never mark it FIRED.
- **FR-010**: When history is shorter than the required duration, the trigger MUST NOT be FIRED and the shortfall MUST be visible.
- **FR-011**: Prior analyses that failed or carry no macro panel MUST be ignored for counting without aborting the run.
- **FR-012**: The feature MUST use only data already stored for prior analyses. It MUST NOT introduce new stored data collections.
- **FR-013**: The feature MUST NOT tie the analysis input to a specific model provider; the change MUST be expressed in the provider-neutral analysis input.
- **FR-014**: The computed held-days results MUST be kept with the stored analysis so the owner can audit why a trigger did or did not fire.
- **FR-015**: Automated tests MUST cover: a count below threshold, exactly at threshold, above threshold, a gap of unavailable data, a condition that stops holding, and a first run with no history.

### Key Entities

- **Sustained Trigger Definition**: A framework rule naming an indicator, a comparison (above or below), a threshold value, and a required duration in days.
- **Sustained Streak**: The computed result for one trigger on one run: days the condition has held, whether the required duration is met, whether the span includes unknown weeks, and whether history was sufficient.
- **Macro Observation**: A dated reading of one indicator from a prior analysis's stored macro panel, either usable or unavailable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With 31 or more days of history in which country risk stayed above 800 bp, the analysis marks that trigger FIRED on 100% of test runs; with fewer than 30 days it never does.
- **SC-002**: A single week of unavailable data inside a qualifying span changes the outcome of 0 test runs compared with the same span fully observed, other than the added "unverified" flag.
- **SC-003**: A run with an empty history completes successfully and reports every sustained trigger as "insufficient history" in 100% of test runs.
- **SC-004**: For every sustained trigger, the owner can read the held-days count and the duration needed in the stored analysis without reconstructing it from earlier weeks.
- **SC-005**: The day-count logic has automated tests for each case in FR-015, and all pass.

## Assumptions

- Analyses run weekly, so history is a series of dated snapshots about seven days apart; the condition is assumed to have held continuously between two consecutive snapshots that both satisfy it.
- Each macro reading carries an as-of date; that date, not the run date, is used to measure days.
- The framework's three sustained triggers are the initial set; the definitions are data-like and easy to extend, but adding triggers beyond framework v3.1 §5 is out of scope.
- "Unknown" weeks bridge a streak only when usable readings on both sides satisfy the condition; unknown weeks at the end of the recent history do not extend it.
- How far back history is read is bounded by the longest required duration plus a margin, which is enough to resolve a 30-day trigger.
- Changing how triggers are phrased in the analysis prompt or framework document is in scope only as far as telling the analysis to rely on the supplied held-days figure.
- Backfilling or re-evaluating past analyses is out of scope.
- Dashboard display of the held-days figures is out of scope; storing them with the analysis is the only presentation requirement.
