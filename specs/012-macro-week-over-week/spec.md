# Feature Specification: Macro Week-over-Week Comparison

**Feature Branch**: `012-macro-week-over-week`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Add a deterministic, code-computed week-over-week comparison for the BCRA international reserves (gross) figure — and the other numeric macro indicators — to the weekly analysis, showing prior → current → change for each, persisted and rendered as a table."

## Context

The weekly analysis already captures a macro panel of indicators (BCRA gross reserves, riesgo país, MEP/official gap, Argentine and US inflation and rates, S&P 500 drawdown, IMF review). The analysis detail page shows each indicator's **current** value, and the indicators are charted over time. But there is no guaranteed, exact **week-over-week** delta: a "reserves went from X to Y" statement only appears if the analysis's narrative happens to mention it, so it is inconsistent and not trustworthy as a number.

This feature adds a deterministic, computed comparison: for each numeric macro indicator, take the current run's reading and the prior analysis's reading and show prior value, current value, the absolute change, and the percent change, with the as-of dates of each reading. Reserves is the motivating indicator, but the comparison covers the whole numeric macro panel since they share the same shape. The figures come from data already captured each run — no new data source.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See exactly how reserves (and macro) moved this week (Priority: P1)

As the portfolio owner reviewing the weekly analysis, I want an exact week-over-week comparison of BCRA reserves and the other numeric macro indicators — prior value, current value, and the change — so I can see at a glance how the macro backdrop shifted without relying on the narrative to mention it.

**Why this priority**: This is the entire feature and the only behavior change. It stands alone and delivers the value immediately.

**Independent Test**: Open an analysis that has a prior week to compare against; confirm a macro week-over-week table shows, per indicator, the prior and current values, the absolute change, and the percent change, with as-of dates — and that the reserves row is present whenever both weeks captured reserves.

**Acceptance Scenarios**:

1. **Given** an analysis with a prior analysis that captured reserves, **When** I open its detail page, **Then** I see a "reserves" row with the prior value, current value, signed absolute change, and percent change, plus both as-of dates.
2. **Given** the same analysis, **When** I view the macro comparison, **Then** every numeric indicator that has both a prior and current reading appears as its own row with the same four figures.
3. **Given** an indicator that was unavailable in either the prior or current run, **When** I view the comparison, **Then** that indicator's row is omitted (not shown as zero or an error).
4. **Given** the very first analysis (no prior week), **When** I open its detail page, **Then** the macro comparison is simply absent — no empty table, no error.
5. **Given** an older analysis generated before this feature, **When** I open its detail page, **Then** the macro comparison is absent and the rest of the page renders normally.

---

### Edge Cases

- **No prior analysis (first run)**: the comparison is omitted entirely.
- **Indicator missing on one side**: if the prior or current reading is unavailable for an indicator, that indicator is skipped — only indicators present in both weeks are compared.
- **Prior value is zero**: the absolute change is still shown; the percent change is omitted (or shown as not-applicable) rather than dividing by zero.
- **Non-numeric indicators**: indicators that are not numeric (e.g., a status label like the IMF review) are excluded from this numeric comparison.
- **Pre-feature analyses**: records generated before this feature lack the comparison; they render with it absent and no errors.
- **Re-run for the same week**: re-running replaces the comparison wholesale, consistent with how the analysis record is replaced.
- **Distinctness**: this comparison must be visually and semantically distinct from the existing position-changes table ("Changes this week") and the narrative-driven analytical week-over-week table, so the three are not confused.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The weekly analysis MUST compute a week-over-week comparison of the numeric macro indicators by comparing the current run's macro readings against the prior analysis's macro readings.
- **FR-002**: For each compared indicator, the comparison MUST include: the indicator's label, its prior value, its current value, the signed absolute change, the percent change, and the as-of date of each reading.
- **FR-003**: The comparison MUST cover BCRA gross reserves and the other numeric macro indicators (riesgo país, MEP/official gap, Argentine and US inflation and policy rates, S&P 500 drawdown); reserves MUST always appear when both weeks captured it.
- **FR-004**: An indicator MUST be omitted from the comparison when it has no prior reading, no current reading, or was marked unavailable in either week — never shown as zero or an error.
- **FR-005**: Non-numeric indicators (e.g., a textual review-status label) MUST be excluded from this numeric comparison.
- **FR-006**: When there is no prior analysis to compare against (first run), the comparison MUST be absent (not an empty table).
- **FR-007**: The comparison MUST be persisted with the analysis so it is available on later visits without re-running, and MUST be optional so that analyses lacking it (pre-feature, or first run) remain valid and displayable.
- **FR-008**: The analysis detail page MUST render the comparison as a table when present and non-empty, and MUST omit it (no empty shell, no error) when absent, empty, or malformed.
- **FR-009**: The rendered comparison MUST be visually and semantically distinct from the existing position-changes table ("Changes this week") and from the narrative-driven analytical week-over-week table.
- **FR-010**: The percent change MUST be omitted or shown as not-applicable when the prior value is zero (no divide-by-zero); the absolute change MUST still be shown.
- **FR-011**: The comparison MUST be derived solely from data already captured per run (the macro panel); no new data source or external fetch is introduced.
- **FR-012**: Re-running an analysis for the same week MUST replace its comparison wholesale.
- **FR-013**: This feature MUST NOT change the charts page or the narrative-driven analytical week-over-week section; both continue to behave as before.

### Key Entities *(include if feature involves data)*

- **Macro Week-over-Week Comparison**: an optional, computed section on the weekly analysis — a list of per-indicator comparison rows.
- **Indicator Comparison Row**: one numeric macro indicator with its label, prior value + as-of date, current value + as-of date, absolute change, and percent change (omitted when the prior value is zero).
- **Macro Panel Reading**: the existing per-indicator reading (value, as-of date, availability) captured each run — the input to the comparison, unchanged by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any analysis with a prior week that captured reserves, the owner can read the exact prior value, current value, and change for reserves without consulting the narrative.
- **SC-002**: 100% of the numeric macro indicators that have both a prior and current reading appear in the comparison; indicators missing on either side appear in 0% of cases.
- **SC-003**: The comparison values match the captured macro readings exactly (the computed change equals current minus prior for every shown row).
- **SC-004**: Every analysis without a prior week, and every analysis generated before this feature, opens and displays correctly with the comparison simply absent (zero errors, zero empty shells).
- **SC-005**: The comparison is available from stored data on later visits with no need to re-run the analysis.
- **SC-006**: The owner can tell the macro comparison apart from the position-changes table and the analytical week-over-week table at a glance.

## Assumptions

- The macro readings already captured each run (value, as-of date, availability) are sufficient inputs; no new indicator or data source is needed.
- "Numeric macro indicators" are those whose value is a number; the textual IMF review-status indicator is excluded from the numeric comparison.
- Covering the whole numeric macro panel (not only reserves) is preferable since the indicators share one shape and the owner benefits from the fuller picture; reserves is the motivating case and is always included when available.
- Percent change is the standard `(current − prior) / prior`, shown to a sensible precision, and omitted when prior is zero.
- The comparison is read-only display + capture; it introduces no new owner action.

## Dependencies

- Builds on **feature 006** (macro panel capture per run, including the prior reading) and **feature 010** (structured-section persistence + rendering pattern on the analysis detail page).

## Out of Scope

- A net-reserves data source or computation — this uses the existing gross reserves figure only.
- Any change to the charts page (gross reserves already charts via the macro time-series).
- Any change to the narrative-driven analytical week-over-week section produced by the model.
