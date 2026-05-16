# Feature Specification: Daily Automatic Price Refresh

**Feature Branch**: `feature/daily-prices-workflow`

**Created**: 2026-05-16

**Status**: Draft

**Input**: User description: "Position prices should be updated once a day, when the market closes. Triggered as a scheduled workflow. Remove the refresh prices button from the frontend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Prices refresh automatically after each US market close (Priority: P1)

As the portfolio owner, I want all my open position prices to be refreshed once per day shortly after the US stock market closes, so that when I open the dashboard the next morning (or any time after the run) the totals and per-position values reflect the most recent close prices without me having to do anything.

**Why this priority**: This is the core value of the change. The dashboard is currently only as fresh as the most recent manual click; portfolio P&L shown to the user can be hours or days stale. Closing-price freshness is the single most valuable improvement.

**Independent Test**: After the next US trading day closes, observe — without taking any action — that the dashboard's "Last refresh" timestamp updates to within ~30 minutes of the US market close, and the per-position current prices reflect that day's closing values from the available price providers.

**Acceptance Scenarios**:

1. **Given** the system is deployed and the schedule is configured, **When** the US stock market closes on a trading weekday, **Then** within ~30 minutes the system refreshes prices for every open position that supports price quoting.
2. **Given** prices were refreshed in the most recent scheduled run, **When** the portfolio owner opens the dashboard later that evening, **Then** the "Last refresh" timestamp shows the time of that scheduled run and per-position current prices reflect the day's close.
3. **Given** a US market holiday (no trading), **When** the scheduled run executes, **Then** the system still attempts a refresh; quotes that come back unchanged or stale from providers do not constitute a failure.
4. **Given** the schedule has fired, **When** at least one provider call fails, **Then** the run still completes for the remaining symbols, the failing symbols are recorded as failed (without overwriting the previous valid price), and the dashboard surfaces the most recent successful "Last refresh" time.

---

### User Story 2 — Manual "Refresh prices" UI control is removed (Priority: P1)

As the portfolio owner, I want the manual "Refresh prices" button removed from the dashboard, so that the UI is simpler and the daily scheduled refresh is the single, predictable source of price freshness.

**Why this priority**: The manual button creates confusion ("is the data fresh? should I click it?") and competes with the scheduled refresh. Removing it is a small, immediate UX win and locks in the new mental model.

**Independent Test**: Open the dashboard. The "Refresh prices" button is no longer visible anywhere on the page. The "Last refresh" timestamp continues to be visible. No console errors are raised about a missing button.

**Acceptance Scenarios**:

1. **Given** the updated dashboard is deployed, **When** the portfolio owner loads the page, **Then** no "Refresh prices" button or equivalent manual refresh control is visible.
2. **Given** the page has loaded, **When** the page's data-loading lifecycle runs, **Then** position data and the "Last refresh" timestamp display correctly with no errors related to a missing button or handler.

---

### User Story 3 — Operator-level manual refresh remains possible out-of-band (Priority: P2)

As the portfolio owner / operator, I want to retain the ability to manually trigger a price refresh from outside the dashboard (e.g. by issuing an authenticated request) for debugging or to recover from a missed scheduled run, so that I have an escape hatch without re-introducing a UI button.

**Why this priority**: Useful but not on the critical path; the scheduled run plus retry-on-next-day is enough for normal operation. Kept so the system stays observable and recoverable.

**Independent Test**: With operator credentials, issue an authenticated request to the existing manual-refresh endpoint and observe that prices are refreshed and the "Last refresh" timestamp updates.

**Acceptance Scenarios**:

1. **Given** an authenticated operator request to the manual refresh endpoint, **When** the request is made, **Then** the system performs a refresh equivalent to the scheduled one and returns a summary of how many symbols succeeded and failed.
2. **Given** an unauthenticated request to the same endpoint, **When** the request is made, **Then** the system rejects it.

---

### Edge Cases

- **US daylight-saving time transitions**: The scheduled run MUST continue to land ~30 minutes after the US market close across DST shifts, not 30 minutes earlier or later.
- **US market holidays**: The scheduled run still executes; failures or unchanged quotes are acceptable and MUST NOT erase previously valid prices.
- **Provider outage**: If a price provider is unreachable, the run MUST complete for the remaining symbols and MUST NOT overwrite previously valid prices with empty/null values.
- **Run takes longer than expected**: Two scheduled runs MUST NOT overlap; if a run is still in progress when the next fires, the second is skipped or queued (no concurrent writes to the same position row).
- **Closed positions**: Closed positions MUST NOT be refreshed (no market value tracked after exit).
- **Cash and non-quotable instruments**: Positions that do not support price quoting (cash reserves, deposits without traded equivalents) MUST be skipped without raising a failure.
- **First load after deployment but before first scheduled run**: The "Last refresh" timestamp shows whatever the prior data was (or "Never" if seeded fresh) and the dashboard renders without breaking.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically refresh the current price of every open, quotable position once per US trading day.
- **FR-002**: System MUST schedule that refresh to run approximately 30 minutes after the US stock market regular-hours close.
- **FR-003**: System MUST execute the scheduled refresh on US trading weekdays (Monday through Friday). Holidays are not skipped at the schedule level.
- **FR-004**: System MUST respect US daylight-saving transitions so that the scheduled run remains aligned with the US market close year-round.
- **FR-005**: System MUST update each refreshed position's current price and the timestamp of when that price was recorded.
- **FR-006**: System MUST record a global "last successful refresh" timestamp that the dashboard can display.
- **FR-007**: System MUST tolerate partial failures: if a subset of symbols fails to fetch, the remaining symbols MUST still be updated, and the failures MUST be recorded without overwriting previously valid prices.
- **FR-008**: System MUST NOT execute two scheduled refresh runs concurrently.
- **FR-009**: Dashboard MUST NOT display any user-facing button or control whose purpose is to trigger a manual price refresh.
- **FR-010**: Dashboard MUST continue to display the "Last refresh" timestamp as a freshness signal.
- **FR-011**: System MUST retain an authenticated, operator-only out-of-band path to trigger a manual refresh equivalent to the scheduled one, for debugging and recovery. Unauthenticated callers MUST be rejected.
- **FR-012**: System MUST log each scheduled run's outcome (total symbols, succeeded, failed, duration) in a way the operator can review after the fact.

### Key Entities

- **Position**: An open holding owned by the portfolio owner. Carries a current price and a timestamp recording when that price was last set. The refresh updates these two fields, never quantity or cost basis.
- **Price record**: A historical record of a quote retrieved for a given instrument at a given time. The refresh appends successful and failed quotes here for observability.
- **Refresh run**: A single execution of the scheduled refresh. Has a start time, an end time, and per-symbol success/failure counts.
- **Last refresh timestamp**: A single project-wide value (or a derived view) representing the most recent successful refresh run, displayed in the dashboard header.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On at least 95% of US trading days, the "Last refresh" timestamp shown on the dashboard reflects a refresh that completed within 60 minutes of the US market close.
- **SC-002**: The portfolio owner performs zero manual actions per week to keep dashboard prices current under normal operation.
- **SC-003**: When a single price provider is unavailable for a run, at least 80% of the position symbols still receive an updated price in that run (the remainder being served by the fallback provider chain).
- **SC-004**: The "Refresh prices" button is absent from every page of the dashboard after deployment, verified by visual inspection and by absence in the rendered HTML.
- **SC-005**: Zero concurrent-write incidents are observed against the positions table caused by overlapping refresh runs over any 30-day window.

## Assumptions

- The portfolio's center of gravity is US-listed instruments (stocks, ETFs, and CEDEARs referencing US equities), so aligning refresh timing to the US close maximizes freshness for the largest share of holdings. Argentine-only positions accept being captured at intraday US time.
- The existing price-provider integrations (Yahoo Finance, IOL, Cohen) continue to be the source of truth for quotes; this feature does not change provider selection logic.
- The existing manual HTTP refresh endpoint is retained as an operator escape hatch and remains protected by the existing authentication mechanism.
- "Approximately 30 minutes after close" is acceptable as the schedule target — minute-level precision is not required.
- US market holidays produce no operational harm; an unsuccessful or no-op refresh on a holiday is acceptable.
- The "Last refresh" timestamp displayed on the dashboard is reset / updated only by successful refresh runs (scheduled or operator-triggered), not by partial-failure runs.
