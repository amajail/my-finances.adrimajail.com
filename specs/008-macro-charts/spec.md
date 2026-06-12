# Feature Specification: Macro Context Time-Series Dashboard

**Feature Branch**: `008-macro-charts`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Macro context time-series dashboard — a read-only page that charts each macro indicator and key portfolio totals over time across the weekly analyses. Small-multiples (one mini-chart per metric, shared x-axis = analysis date) because units/scales differ wildly. IMF review status as a categorical event strip, not a line. Mark unavailable weeks distinctly (no silent interpolation); degrade gracefully with few points. Overlay mode pairing one portfolio series with one macro series on a dual axis. Plot against the analysis date but show each metric's as-of date in the tooltip. Range selector (8/26/52 weeks). Data from a new read endpoint projecting the already-persisted macroContext + portfolioTotals across analyses (feature 006) — no new storage. Pick a lightweight charting library. Builds on feature 006."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every macro indicator and portfolio total trend over time (Priority: P1)

The owner opens a new dashboard page and sees a grid of small mini-charts — one per numeric macro indicator (riesgo país, FX gap, BCRA reserves, AR inflation, AR rate, US inflation, US rate, S&P 500 drawdown) and one per key portfolio total (total USD, total ARS, unrealized P&L, grand total USD) — each plotted over time with the analysis date on a shared horizontal axis. Each mini-chart auto-scales its own vertical axis (no shared scale across metrics). Hovering a point shows the value and the metric's as-of date.

**Why this priority**: This is the core value — turning the per-week snapshots feature 006 persists into visible trends, so the owner can see regime direction (gap widening, reserves falling, drawdown deepening) at a glance. It is independently valuable and the foundation for everything else.

**Independent Test**: With several weekly analyses on record, open the page; verify each indicator/total has its own mini-chart, all sharing the same date axis, each with an independent value scale, and that hovering reveals value + as-of.

**Acceptance Scenarios**:

1. **Given** multiple analyses with macro + totals data, **When** the owner opens the page, **Then** a mini-chart appears for each numeric indicator and each portfolio total, all sharing the analysis-date axis.
2. **Given** indicators with very different ranges (e.g. reserves in thousands vs FX gap near 0%), **When** the charts render, **Then** each uses its own vertical scale so no metric flattens another.
3. **Given** a plotted point, **When** the owner hovers it, **Then** the value and the metric's as-of date are shown (the as-of may differ from the analysis date).

---

### User Story 2 - Missing data is visible, not hidden (Priority: P2)

Weeks where an indicator was unavailable (e.g. a source outage) appear as distinct gaps/markers rather than being silently connected across, so the owner never mistakes a missing reading for a smooth trend. The page also stays sensible when there are very few data points.

**Why this priority**: Trust — a chart that silently interpolates over missing data misleads. Required for the charts to be decision-grade, but secondary to having the charts at all.

**Independent Test**: With an analysis where one indicator is unavailable, verify that indicator's mini-chart shows a distinct gap/marker at that date and does not draw a connecting line through it.

**Acceptance Scenarios**:

1. **Given** an indicator unavailable for one week, **When** its mini-chart renders, **Then** that week is shown as a gap/distinct marker, not interpolated.
2. **Given** only one data point exists, **When** the page renders, **Then** it shows that point (or a clear "not enough history yet" state) without error.
3. **Given** no analyses with chartable data, **When** the page opens, **Then** it shows a friendly empty state.

---

### User Story 3 - IMF review status as an event timeline (Priority: P2)

Because the IMF review status is categorical (not a number), it is rendered as an event strip along the same date axis — a labeled marker whenever the status changes — rather than a numeric line.

**Why this priority**: Completes the macro picture without distorting it onto a numeric axis; depends on the shared date axis from US1.

**Independent Test**: With analyses whose IMF status changes over time, verify the strip shows markers at the change points labeled with the status, aligned to the same dates as the other charts.

**Acceptance Scenarios**:

1. **Given** analyses with differing IMF statuses, **When** the page renders, **Then** an event strip shows the status over time with markers at changes, aligned to the shared date axis.
2. **Given** the IMF status was unavailable for a week, **When** the strip renders, **Then** that week is shown as unknown/gap, not a fabricated status.

---

### User Story 4 - Overlay two series to see correlation (Priority: P3)

The owner picks one portfolio series (e.g. total USD) and one macro series (e.g. FX gap) and views them together on a single chart with two vertical axes, to eyeball whether they move together.

**Why this priority**: High-insight but optional; depends on the data and axis handling from US1.

**Independent Test**: Select a portfolio series and a macro series; verify both render on one chart sharing the date axis with independent left/right scales.

**Acceptance Scenarios**:

1. **Given** the overlay mode, **When** the owner selects one portfolio and one macro series, **Then** both render on one chart with two independent vertical axes and the shared date axis.
2. **Given** either selected series has gaps, **When** the overlay renders, **Then** gaps are shown distinctly (consistent with US2), not interpolated.

---

### User Story 5 - Focus the time range (Priority: P3)

The owner can limit the charts to a recent window (e.g. last 8 / 26 / 52 weeks, or all), so older data doesn't compress recent movement.

**Why this priority**: Convenience; meaningful only once enough history accrues.

**Acceptance Scenarios**:

1. **Given** more than the selected window of analyses, **When** the owner picks a range, **Then** all charts redraw to that window on the shared axis.
2. **Given** fewer analyses than the window, **When** a range is selected, **Then** all available points are shown without error.

---

### Edge Cases

- **Very little history** (1–2 analyses): show the point(s) or a clear "not enough history yet" state; never crash.
- **As-of lag**: a metric's as-of date can trail the analysis date by weeks (monthly inflation); points are positioned by analysis date, with as-of surfaced on hover so a lagging reading isn't misread as current.
- **Unavailable vs zero**: an unavailable reading must never be plotted as 0 — it is a gap.
- **Failed analyses**: a failed run may still have captured macro/totals (feature 006 preserves them); such points are included when present (the readings are valid regardless of run status).
- **Mixed availability across metrics**: one metric can have a gap on a date where others have values — gaps are per-metric, not per-date.
- **Re-run replaced a date**: only the current stored analysis per date contributes (one point per date).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a read-only view that plots each numeric macro indicator and each key portfolio total (total USD, total ARS, unrealized P&L, grand total USD) over time, one mini-chart per metric, sharing a common analysis-date horizontal axis.
- **FR-002**: Each mini-chart MUST scale its own vertical axis independently; metrics MUST NOT share a single vertical scale.
- **FR-003**: Each plotted point MUST be positioned by the analysis date, and hovering MUST reveal the value and the metric's as-of date.
- **FR-004**: Weeks where a metric is unavailable MUST be shown as distinct gaps/markers and MUST NOT be interpolated or plotted as zero.
- **FR-005**: The view MUST degrade gracefully with very little data: a single point renders (or a clear "insufficient history" state), and an empty dataset shows a friendly empty state — never an error.
- **FR-006**: The IMF review status MUST be rendered as a categorical event strip aligned to the shared date axis (markers at status changes), not as a numeric line; unavailable weeks shown as unknown/gap.
- **FR-007**: The view MUST offer an overlay mode that plots one chosen portfolio series and one chosen macro series together on one chart with two independent vertical axes and the shared date axis.
- **FR-008**: The view MUST offer a time-range selector (e.g. last 8 / 26 / 52 weeks / all) that redraws all charts to the selected window.
- **FR-009**: The data MUST come from a new read interface that projects the already-persisted per-analysis macro panel and portfolio totals across analyses (feature 006); the feature MUST NOT introduce new stored data.
- **FR-010**: Analyses produced before feature 006 (lacking macro/totals) MUST be tolerated — they simply contribute no points; the view renders from whatever data exists.

### Key Entities

- **Macro Series**: a time-ordered projection across weekly analyses — for each analysis date, the macro panel readings (value, as-of, availability per indicator) and the portfolio totals. Derived from existing persisted data; not stored.
- **Series point**: one analysis date's value for one metric, with its as-of date and availability.
- **Weekly Analysis** (existing, feature 006): the source of each point's macro panel + totals.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From one page, the owner can see the trend of every macro indicator and key portfolio total across the available weeks without opening individual analyses.
- **SC-002**: No metric's scale visually distorts another — each mini-chart is independently scaled (verifiable: a near-zero-range metric and a thousands-range metric both read clearly on the same page).
- **SC-003**: Every unavailable reading is visually distinguishable from a real value and is never shown as zero or interpolated.
- **SC-004**: The owner can compare any one portfolio series against any one macro series on a shared timeline in the overlay mode.
- **SC-005**: The page renders within ~2 seconds for up to 52 weeks of data and remains correct (no crash, clear state) from the very first data point.
- **SC-006**: Each point's as-of date is discoverable (on hover) so a lagging reading is never mistaken for the analysis-week value.

## Assumptions

- **Read-only / no new storage**: the page only projects data feature 006 already persists; nothing is written. The new read interface is private/key-authenticated like the existing analysis endpoints, and returns the same portfolio totals already exposed by the analysis detail endpoint (no new privacy surface).
- **One point per analysis date**: re-runs replace a date wholesale, so each date contributes at most one point.
- **Default range**: with little history, the default shows all available points; the range selector becomes useful as history grows.
- **Charting approach** is a planning decision (a lightweight client-side charting library vs hand-rolled SVG); the dashboard currently has no charting library, so any new dependency will be justified at planning time. This does not affect the user-facing requirements.
- **Metrics charted**: the eight numeric macro indicators + IMF status (as a strip) + four portfolio totals (total USD, total ARS, unrealized P&L USD, grand total USD). Per-position data is out of scope (the charts are aggregate/macro only).
- **Single user**: the owner is the only viewer; no sharing/export in this iteration.
- **Out of scope**: editing/annotating data, alerting on thresholds, forecasting/trendlines, exporting images/CSV, ingesting macro readings on non-analysis days (the series is one-point-per-weekly-analysis), and per-position time series.
