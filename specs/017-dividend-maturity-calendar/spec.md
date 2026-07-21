# Feature Specification: Dividend & Maturity Calendar

**Feature Branch**: `017-dividend-maturity-calendar`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Dividend and maturity calendar. A consolidated forward-looking calendar of income and expiry events across all portfolio holdings. Sources: (1) maturities — every open fixed-income position (bond, bopreal, lecap, on, deposit) already stores maturityDate; surface upcoming maturities with their estimated redemption value; (2) dividends — for US-listed holdings (stocks, ETFs, CEDEARs' underlyings) fetch upcoming ex-dividend and payment dates plus estimated amount per share via the existing market-data source. New calendar API returning ordered upcoming events, a new dashboard calendar page grouped by month with mobile support per feature-016 patterns, and the weekly analysis prompt gains a compact upcoming-events block so rebalance suggestions can anticipate maturities and reinvestment needs. Read-only feature: no position mutations; no manual refresh button; events compute on request."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See upcoming income and expiry events in one place (Priority: P1)

As the portfolio owner, I open a calendar page and see every upcoming event that will put cash in motion — fixed-income maturities (bonds, BOPREAL, LECAPs, ONs, deposits) and dividends from US-listed holdings — ordered by date and grouped by month, so I can plan reinvestment ahead of time instead of discovering a maturity after the cash lands.

**Why this priority**: This is the core value: today maturity dates sit invisible on individual positions and dividends aren't tracked anywhere. A single consolidated view is independently useful even if nothing else ships.

**Independent Test**: With open positions that have maturity dates in the store, load the calendar page and verify every such position appears under the correct month with its estimated amount; verify a dividend-paying US holding shows its next ex-dividend/payment dates.

**Acceptance Scenarios**:

1. **Given** open fixed-income positions with maturity dates within the horizon, **When** the owner opens the calendar page, **Then** each appears as a maturity event under its month with symbol, broker, date, days-until, and estimated redemption amount.
2. **Given** a US-listed holding with a declared upcoming dividend, **When** the owner opens the calendar page, **Then** the ex-dividend and/or payment date appears with the estimated amount for the held quantity.
3. **Given** the calendar page on a 360px-wide phone viewport, **When** the owner browses events, **Then** there is zero horizontal document scroll and all event details remain readable (feature-016 standards).
4. **Given** a holding for which no dividend information is available, **When** the calendar renders, **Then** that holding simply has no dividend events (no error, no placeholder noise).

---

### User Story 2 - Weekly analysis anticipates upcoming events (Priority: P2)

As the portfolio owner, I want the weekly rebalance analysis to know about events occurring in the next few weeks, so its suggestions anticipate incoming cash (e.g., "LECAP X matures in 12 days — plan reinvestment of the proceeds") instead of reacting a week after the fact.

**Why this priority**: Ties the calendar into the existing decision loop; valuable but depends on the event data from Story 1 existing.

**Independent Test**: Run a weekly analysis while a position matures within the look-ahead window; verify the analysis input contains the upcoming-events block and the narrative or suggested orders acknowledge the maturity.

**Acceptance Scenarios**:

1. **Given** a maturity occurring within the analysis look-ahead window, **When** the weekly analysis runs, **Then** its input includes a compact upcoming-events block listing that event.
2. **Given** no events within the window, **When** the analysis runs, **Then** the block is omitted entirely (no token waste on an empty section).

---

### User Story 3 - Monthly income outlook (Priority: P3)

As the portfolio owner, I want each month group on the calendar page to show its estimated total incoming cash (maturities + dividends, in USD), so I can see at a glance how much liquidity each upcoming month will free up.

**Why this priority**: A convenience aggregation over Story 1 data; nice to have, trivially skippable.

**Independent Test**: With multiple events in one month, verify the month header total equals the sum of that month's estimated USD amounts, and that events without an estimable amount are visibly excluded from the total.

**Acceptance Scenarios**:

1. **Given** a month with several events with estimated amounts, **When** the calendar renders, **Then** the month header shows their USD sum and notes if any event was excluded for lacking an estimate.

---

### Edge Cases

- **Overdue maturity**: a position whose maturity date is in the past but is still open (proceeds not yet swept) appears in a distinct "overdue" state at the top, not silently dropped.
- **Fixed-income position without a maturity date**: not shown on the calendar; the page notes how many open fixed-income positions lack a date so missing data is visible rather than invisible.
- **Dividend source unavailable/slow**: maturities still render with a notice that dividend data is temporarily unavailable; the page never fails entirely because of the external source.
- **CEDEARs**: dividend dates come from the underlying US listing; per-share amounts must be adjusted for the CEDEAR ratio — when the ratio is unknown, the event shows dates without an amount rather than a wrong number.
- **Non-USD amounts** (e.g., ARS-denominated maturities): shown in native currency with the USD estimate derived from the app's existing conversion; if conversion is unavailable, native amount only, excluded from month totals.
- **Suspended/irregular dividends**: only declared/known upcoming events appear; the calendar never extrapolates from past payment history.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST derive maturity events from every open position that has a maturity date (asset types: bond, bopreal, lecap, on, deposit), including an estimated redemption amount based on held quantity and redemption conventions.
- **FR-002**: System MUST obtain upcoming dividend events (ex-dividend date, payment date where known, estimated amount per share) for US-listed equity holdings, including CEDEAR underlyings, from the app's existing market-data source.
- **FR-003**: System MUST expose a single ordered event feed where each event carries: event type, date, days-until, symbol, broker, held quantity, estimated amount in native currency, and estimated USD amount where derivable.
- **FR-004**: The dashboard MUST present the feed on a new calendar page, grouped by month in ascending date order, meeting the feature-016 mobile standards (zero horizontal document scroll at 360px viewport).
- **FR-005**: The weekly analysis input MUST include a compact upcoming-events block covering the analysis look-ahead window, and MUST omit the block when no events fall inside the window.
- **FR-006**: Events MUST be computed on request; there is no manual refresh control and no user-triggered data mutation anywhere in the feature.
- **FR-007**: Failure of the dividend data source MUST NOT prevent maturity events from rendering; the page MUST indicate degraded dividend data.
- **FR-008**: All amounts MUST be presented as estimates; events whose amount cannot be estimated MUST still appear with their dates.
- **FR-009**: Overdue maturities (past date, position still open) MUST be visibly flagged rather than hidden or mixed with future events.
- **FR-010**: Month groups MUST display the estimated USD total of their events, noting exclusions for events lacking estimates.

### Key Entities

- **Calendar Event**: one future (or overdue) cash-relevant occurrence; type (maturity | dividend ex-date | dividend payment), date, source holding (symbol, broker, asset type, quantity), estimated native amount + currency, estimated USD amount, days-until, overdue flag.
- **Event Horizon**: the forward window bounding a request — calendar page default and the (shorter) weekly-analysis window.
- **Month Group**: presentation grouping of events with an estimated USD subtotal and an excluded-from-total count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of open positions carrying a maturity date within the horizon appear on the calendar page; zero maturities are silently missing.
- **SC-002**: The owner can answer "what matures or pays out in the next 90 days and roughly how much" from a single page in under 10 seconds, on desktop or phone.
- **SC-003**: When at least one event falls within the analysis look-ahead window, the weekly analysis output references upcoming proceeds/reinvestment in its narrative or suggested orders (verifiable on each such run).
- **SC-004**: The calendar page produces zero horizontal document scroll at a 360px viewport.
- **SC-005**: With the dividend source unavailable, the page still renders all maturity events with a visible degradation notice (no blank/error page).

## Assumptions

- Default calendar horizon is 6 months ahead (plus overdue items); the weekly-analysis block uses a 4-week look-ahead. Both are implementation-tunable constants, not user settings, in v1.
- USD estimates reuse the app's existing currency-conversion logic and conventions (including per-100-nominales redemption conventions for fixed income); estimates do not attempt coupon/CER/interest precision — principal-level accuracy is sufficient for planning.
- Dividend data availability is inherently limited to what the existing market-data source knows (primarily US-listed instruments); Argentine-local instruments without such data simply produce no dividend events, which is acceptable.
- CEDEAR ratio data may not be available for all symbols in v1; date-only events are an acceptable fallback.
- No new storage is assumed; whether dividend lookups need caching is a planning-phase decision. Everything else reads existing position data.
- Single-user application; the calendar inherits the dashboard's existing access model, and no additional privacy surface is created (event data derives from data already in the store).
