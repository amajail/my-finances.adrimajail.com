# Feature Specification: Portfolio Growth vs Benchmarks (indexed)

**Feature Branch**: `009-performance-benchmarks`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Portfolio performance vs benchmarks, using the weekly portfolio totals persisted per analysis (feature 006). Compare the portfolio against S&P 500, US/AR inflation, and MEP. A dashboard view plots cumulative growth over time + a summary." Reframed at clarification: **no cash-flow log** — so rather than a (cash-flow-dependent) time-weighted return, the feature shows an **indexed growth comparison**: portfolio total value and each benchmark are indexed to 100 at the window start and overlaid, with the portfolio line reflecting raw value (deposits/withdrawals appear as visible steps, not adjusted out).

## Clarifications

### Session 2026-06-12

- Q: Will there be a cash-flow log (deposits/withdrawals) to compute true time-weighted return? → A: **No cash-flow log.** Reframe to an indexed growth comparison; the portfolio line is raw total value (a deposit shows as a visible step), explicitly NOT a cash-flow-adjusted "return". No new stored data.
- Q: Where do S&P 500 (and inflation) benchmark levels come from, given only their rates/drawdown are persisted? → A: **Fetch the index/price levels on-demand** for the analysis-date range from public sources (no new storage).
- Q: Cash-flow timing convention for time-weighted return? → A: **Not applicable** — there is no cash-flow log and no time-weighted return in this framing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Indexed growth: portfolio value vs holding USD (Priority: P1)

The owner opens a performance page and sees the portfolio's total value indexed to 100 at the start of the window, plotted over time, overlaid with the MEP rate indexed to 100 (i.e. "what if I'd just held USD"). Both come from data already persisted weekly (feature 006), so this works immediately. The portfolio line is the raw total value — if the owner deposited money, the line steps up visibly (it is labeled as value growth, not investment return).

**Why this priority**: This is the core, honest, zero-new-data view — "did my total value grow faster than just sitting in dollars?" — and it ships with no benchmark fetching. It is the foundation the other benchmarks overlay onto.

**Independent Test**: With several weeks of portfolio totals and MEP rates, open the page; verify the portfolio and MEP lines both start at 100 and track their respective weekly values; a week with a large value jump (e.g. a deposit) shows as a step.

**Acceptance Scenarios**:

1. **Given** several weeks of portfolio totals, **When** the page opens, **Then** the portfolio value is indexed to 100 at the first point and plotted over time.
2. **Given** the same window, **When** the MEP benchmark is shown, **Then** the MEP rate is indexed to 100 over the same dates and overlaid.
3. **Given** a week where total value jumped sharply, **When** the line renders, **Then** the jump is shown as-is (raw value) — the view does not claim it as a return.

---

### User Story 2 - Benchmark overlays: S&P 500 and inflation (Priority: P2)

The owner overlays the S&P 500 and inflation (US and Argentina), each indexed to 100 over the same window, so they can see whether their total value outgrew a passive index and whether it outgrew inflation (the real-terms read). The benchmark levels are fetched on-demand for the analysis dates.

**Why this priority**: The headline comparisons — "did I beat the index / beat inflation" — but they depend on US1's indexed timeline and on fetching benchmark levels not persisted today.

**Independent Test**: With benchmark levels available for the window, verify the S&P and inflation lines are indexed to 100 at the start and overlaid; a date with no benchmark level is shown as a gap.

**Acceptance Scenarios**:

1. **Given** S&P 500 levels for the window, **When** the S&P benchmark is selected, **Then** it is indexed to 100 at the start and overlaid on the same timeline as the portfolio.
2. **Given** US and Argentina price levels for the window, **When** the inflation benchmark is shown, **Then** each is indexed to 100 so the gap between the portfolio line and the inflation line reads as real (above-inflation) growth.
3. **Given** a benchmark whose data cannot be fetched for the window, **When** the page renders, **Then** that benchmark is marked unavailable rather than fabricated or interpolated.

---

### User Story 3 - Summary and range (Priority: P3)

The page shows a summary — each series' total growth (%) over the selected window and the portfolio's gap vs each benchmark — and a range selector (e.g. last 8 / 26 / 52 / all weeks). The view degrades gracefully when history is short.

**Why this priority**: Convenience and at-a-glance reading; depends on the series from US1/US2.

**Acceptance Scenarios**:

1. **Given** an indexed series, **When** the summary renders, **Then** it shows each series' growth % over the window and the portfolio-minus-benchmark gap.
2. **Given** more history than the selected range, **When** a range is chosen, **Then** all series re-index to 100 at the new window start and redraw.
3. **Given** fewer than two data points, **When** the page opens, **Then** it shows a clear "insufficient history" state without error.

---

### Edge Cases

- **Deposits/withdrawals**: appear as visible steps in the portfolio line; the view never claims them as investment return (no cash-flow adjustment exists).
- **Re-indexing on range change**: indexing is relative to the first point of the *current* window, so changing the range re-bases every series to 100.
- **Value/benchmark gaps**: a week with no portfolio value, or a benchmark level that can't be fetched, is a gap — not interpolated and not plotted as 0.
- **First point**: anchors every series at 100 (no growth shown for the first week).
- **As-of lag**: inflation levels update monthly; the nearest available level on/before each analysis date is used, and its as-of is surfaced.
- **Benchmark fetch failure**: that benchmark is unavailable for the run; the portfolio + available benchmarks still render.

## Requirements *(mandatory)*

### Functional Requirements

#### Indexed growth (portfolio + MEP — no new data)

- **FR-001**: The system MUST index the weekly portfolio total value (feature 006 `grandTotalUsd`) to 100 at the start of the selected window and plot it over time (by analysis date).
- **FR-002**: The portfolio line MUST reflect RAW total value; deposits/withdrawals appear as visible steps and MUST NOT be adjusted out. The view MUST label it as value growth, not a cash-flow-adjusted return.
- **FR-003**: The system MUST index the MEP rate (feature 006 `mepRate`) to 100 over the same window and overlay it as a "held USD" benchmark.
- **FR-004**: Indexing MUST be relative to the first point of the current window; changing the window re-bases every series to 100.

#### Benchmark overlays (on-demand levels)

- **FR-005**: The system MUST index the S&P 500 to 100 over the window; the S&P 500 levels per analysis date MUST be fetched on-demand from a public source (the index level is not persisted today).
- **FR-006**: The system MUST index US and Argentina price levels (inflation) to 100 over the window, fetched on-demand, so the gap between the portfolio line and an inflation line reads as real (above-inflation) growth.
- **FR-007**: For each benchmark, the level used for an analysis date MUST be the nearest available level on or before that date (with its as-of surfaced); a date with no available level is a gap.
- **FR-008**: A benchmark whose data cannot be fetched for the window MUST be shown as unavailable, never interpolated or fabricated.

#### Display

- **FR-009**: A dashboard view MUST overlay the portfolio's indexed value and the selected benchmark(s) on one timeline (shared analysis-date axis), each indexed to 100.
- **FR-010**: The view MUST show a summary: each series' total growth (%) over the window and the portfolio's gap vs each benchmark.
- **FR-011**: The view MUST offer a range selector (e.g. last 8 / 26 / 52 / all weeks) that re-bases and redraws all series.
- **FR-012**: The view MUST degrade gracefully with little history (clear "insufficient history" state; never an error) and show gaps distinctly (consistent with feature 008).

#### Data

- **FR-013**: The feature MUST add no new stored data — the portfolio value and MEP come from feature 006; benchmark levels are fetched on-demand at view time.

### Key Entities

- **Indexed series**: a computed (not stored) time series per metric — portfolio value and each benchmark, rebased to 100 at the window start. Derived from feature 006 totals + on-demand benchmark levels.
- **Benchmark levels**: on-demand index/price levels (S&P 500, US CPI, Argentina CPI) aligned to analysis dates; MEP comes from the persisted weekly totals.
- **Portfolio value series** (existing, feature 006): the weekly `grandTotalUsd` that anchors the comparison.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can see, on one chart, whether their total portfolio value grew faster or slower than holding USD (MEP) over the available weeks — using only already-persisted data.
- **SC-002**: With benchmark overlays, the owner can see whether their value outgrew the S&P 500 and whether it outgrew inflation (real-terms read) over the window.
- **SC-003**: Every series is indexed to 100 at the window start; changing the range re-bases all series correctly (verifiable on a worked example).
- **SC-004**: No series is fabricated over missing data — value gaps and unavailable benchmarks are shown as such, never interpolated or plotted as 0.
- **SC-005**: The page renders within ~2 seconds for up to 52 weeks and remains correct (clear "insufficient history" state) from the first weeks.
- **SC-006**: The portfolio line is never presented as a cash-flow-adjusted return — deposits/withdrawals are visible as steps and labeled honestly.

## Assumptions

- **No cash-flow log / no time-weighted return**: explicitly reframed (Clarifications). The portfolio line is raw total value.
- **Value series = feature 006 totals**: weekly `grandTotalUsd` (USD); MEP from `mepRate`. One point per analysis date.
- **Inflation as a benchmark**: shown as an indexed price-level line; "real growth" is read as the portfolio line above the inflation line (no separate deflated series required, though a deflated view may be added).
- **On-demand benchmark levels**: S&P 500 and CPI levels fetched per view from public sources (reusing the existing FRED access for US series); results may be cached within a request. No new storage.
- **Charting**: reuses the hand-rolled SVG + per-analysis projection approach from feature 008 (no new charting dependency).
- **Single user**: the owner is the only viewer; the data shown (aggregate totals + public benchmarks) matches the existing privacy posture.
- **Out of scope**: cash-flow tracking, time-weighted / money-weighted return, per-position or per-broker attribution, tax-lot accounting, real-time pricing, and importing brokerage statements.
