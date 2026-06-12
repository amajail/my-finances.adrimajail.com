# Feature Specification: Weekly Context Capture (Macro Metrics + Portfolio Totals + Position Changes)

**Feature Branch**: `006-weekly-context-capture`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Extend the weekly rebalance analysis to capture, use, and display the full context each analysis was made under: a panel of macro indicators (riesgo país, MEP/official FX gap, BCRA net reserves, ARG monthly inflation, ARG interest rate, USA inflation, USA interest rate, S&P 500 drawdown from high, IMF review status), the portfolio totals at run time (totals and unrealized P&L in USD and ARS, conversion rate used), and which positions were added/removed/increased/reduced that week. Source doc: `feature-weekly-context-capture.md`."

## Clarifications

### Session 2026-06-12

- Q: How should the IMF program review status be classified from last week's news? → A: Small AI classification call (reuse existing AI client; map news → status enum; must respect existing cost caps and safe-logging rules).
- Q: US series (inflation, Fed funds, S&P 500) are most reliable from FRED, which needs a free API key. Acceptable, or keyless-only? → A: FRED API key acceptable — stored as an app secret, never committed.
- Q: The analysis read API would now also return portfolio totals, unrealized P&L, and per-position changes. Acceptable exposure? → A: Yes — acceptable; treat the analysis API as private/key-authenticated, return all new fields (consistent with suggested orders today).
- Q: Should the carried-forward IMF status have a staleness cap so an old status doesn't show indefinitely? → A: Yes — carry forward, but revert to "unknown" after ~8 weeks with no fresh news.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Macro context captured, used, and shown (Priority: P1)

Every weekly analysis automatically gathers a fixed panel of macro indicators from public data sources at generation time, gives them to the AI analyst so its rebalance reasoning reflects the current regime, stores them immutably on the analysis record, and shows them on the analysis detail view. If any indicator cannot be obtained, the analysis still runs and that indicator is recorded and shown as unavailable.

**Why this priority**: This is the core of the feature — richer context directly improves the quality of weekly rebalance suggestions and preserves the regime each historical analysis was made under. Today only one indicator (riesgo país) exists, and its failure aborts the whole run.

**Independent Test**: Trigger a weekly analysis run; verify the stored record contains a reading (value + as-of date) or an explicit "unavailable" marker for all nine indicators, the narrative references macro conditions, and the detail view displays the panel.

**Acceptance Scenarios**:

1. **Given** all public sources are reachable, **When** the weekly analysis runs, **Then** the stored analysis contains a value and as-of date for each of the nine indicators, and the detail view displays them grouped (Argentina / US / global).
2. **Given** one indicator's source is down, **When** the weekly analysis runs, **Then** the run completes normally, the failing indicator is stored and displayed as "unavailable", and all other indicators are populated.
3. **Given** the country-risk (riesgo país) source is down, **When** the weekly analysis runs, **Then** the run still completes (today it fails) and riesgo país is marked unavailable.
4. **Given** an indicator is unavailable, **When** the AI analyst receives its inputs, **Then** the indicator is explicitly presented as "unavailable" rather than omitted or zeroed.
5. **Given** a completed analysis from before this feature, **When** the owner opens its detail view, **Then** the page renders normally without macro data and without errors.

---

### User Story 2 - Portfolio totals preserved per week (Priority: P2)

Each weekly analysis permanently records the portfolio's aggregate state at run time: total value held in USD, total value held in ARS, the combined total in USD, unrealized profit/loss in each currency, cost basis in each currency, and the ARS→USD conversion rate (with its as-of date) used for the combined figures. These totals are visible on the analysis detail view for any week, past or future.

**Why this priority**: These aggregates are already computed every run but thrown away — historical analyses cannot show what the portfolio was worth or how it was performing at the time, and the figures cannot be reconstructed afterward. Preserving them also creates the weekly value series needed for future performance tracking.

**Independent Test**: Run a weekly analysis, then retrieve the analysis record and confirm the totals match the portfolio summary at run time; open the detail view and see the totals block.

**Acceptance Scenarios**:

1. **Given** a weekly analysis runs successfully, **When** the owner views that analysis later, **Then** they see total USD, total ARS, combined total, unrealized P&L in both currencies, and the conversion rate used — exactly as they were at generation time.
2. **Given** the portfolio data loaded but the AI step failed, **When** the failed analysis record is stored, **Then** the portfolio totals are still preserved on it (the week's data point is not lost).
3. **Given** a pre-feature analysis with no totals, **When** the owner opens its detail view, **Then** the totals block is absent or marked as not recorded, with no errors.

---

### User Story 3 - Position changes for the week, computed exactly (Priority: P2)

Each weekly analysis shows which positions were added, removed, increased, or reduced since the previous analysis — computed mechanically from the recorded position snapshots (not estimated by the AI), stored on the record, shown on the detail view, and supplied to the AI analyst so its week-over-week reasoning uses exact numbers.

**Why this priority**: The owner explicitly wants to see weekly position changes, and today the AI is asked to *infer* them from raw snapshots — unreliable arithmetic that this story replaces with computed facts. It also strengthens the analysis's ability to judge whether last week's suggestions were executed.

**Independent Test**: With a prior analysis on record, change one position's quantity, run a new analysis, and verify the change list contains exactly that position with correct before/after quantities; verify it appears on the detail view and in the AI's inputs.

**Acceptance Scenarios**:

1. **Given** a prior analysis exists and a position's quantity increased during the week, **When** the new analysis runs, **Then** the stored change list contains that position marked "increased" with quantity before, after, and delta.
2. **Given** a position present last week is gone this week, **When** the new analysis runs, **Then** the change list marks it "removed"; a brand-new position is marked "added".
3. **Given** only market prices moved but no quantities changed, **When** the new analysis runs, **Then** the change list is empty ("no changes this week") — price moves alone are not position changes.
4. **Given** no prior analysis exists (first run), **When** the analysis runs, **Then** the change list is recorded as "unknown" (distinct from "no changes") and displayed accordingly.

---

### User Story 4 - Trend-aware analysis (Priority: P3)

The AI analyst receives the previous week's macro panel alongside the current one, so the narrative can reason about direction and trends ("country risk fell for the second week", "the FX gap widened from X% to Y%") rather than isolated levels.

**Why this priority**: Cheap addition with real reasoning value — the prior analysis is already loaded during generation. Valuable but dependent on Story 1 being in place and on at least two weeks of data existing.

**Independent Test**: With two consecutive analyses on record, verify the second run's AI inputs include both current and prior macro readings, and the narrative references week-over-week macro movement.

**Acceptance Scenarios**:

1. **Given** a prior analysis with macro data exists, **When** a new analysis runs, **Then** the AI inputs include the prior week's macro readings alongside the current ones.
2. **Given** the prior analysis predates this feature (no macro data), **When** a new analysis runs, **Then** the AI inputs indicate prior macro context is not available, and the run completes normally.

---

### Edge Cases

- **All indicators unavailable**: the run still completes; the panel shows all entries as unavailable; the AI is told macro context is missing.
- **Quiet IMF week**: most weeks have no IMF program news; the last known status is carried forward with its original as-of date, reverting to "unknown" after ~8 weeks without fresh news (FR-007). A fetch/classification failure with no prior status to carry is the only case shown as "unavailable".
- **Stale readings**: some indicators update monthly (inflation) — their as-of date may lag the analysis date by weeks. The as-of date must be stored and displayed per indicator so a lagging reading is not mistaken for a current one.
- **Re-run of the same week**: re-running an analysis for the same date replaces the record wholesale (existing behavior); macro readings, totals, and position changes are re-captured at the new run time, and position changes are still computed against the *previous week's* analysis, not the replaced run.
- **Prior analysis was a failed run**: position changes and prior-macro context are taken from the most recent analysis that has the needed data; if the immediately preceding record lacks a position snapshot, the change list falls back to the nearest prior record that has one (or "unknown" if none).
- **Failed AI step**: macro readings, totals, and position changes gathered before the failure are preserved on the failed record.
- **Legacy compatibility**: views and integrations that read the existing standalone riesgo país fields keep working — those fields remain populated even though riesgo país becomes part of the unified panel.

## Requirements *(mandatory)*

### Functional Requirements

#### Macro context panel

- **FR-001**: System MUST gather the following nine indicators at weekly-analysis generation time: riesgo país (bp), MEP/official FX gap (%), BCRA net reserves (USD millions), Argentina monthly inflation (%), Argentina central-bank policy/reference interest rate (%), USA inflation (%), USA policy interest rate (%), S&P 500 drawdown from its high (%), and IMF program review status.
- **FR-002**: Each indicator reading MUST carry its value, the date the value is current as-of, and an availability flag.
- **FR-003**: All indicators MUST be obtained automatically from public data sources; no manual entry is required in the normal weekly flow.
- **FR-004**: Failure to obtain any indicator MUST NOT fail or block the analysis run; the indicator is recorded as unavailable and all others proceed independently. This explicitly includes riesgo país, whose failure currently aborts the run.
- **FR-005**: The FX gap MUST be computed from the MEP and official exchange rates as (MEP − official) / official × 100.
- **FR-006**: The S&P 500 drawdown MUST be computed against the index's all-time high and expressed as a non-positive percentage.
- **FR-007**: The IMF review status MUST be derived from publicly available IMF/Argentina program news from the trailing week, classified into a small fixed set of states (e.g., none / pending / staff-level agreement / approved / disbursement) by a dedicated AI classification step (see FR-022). On a week with no program news, the system MUST carry forward the last known status with its original as-of date (staleness visible via the date), but MUST revert to "unknown" once roughly 8 weeks have elapsed with no fresh news rather than displaying a possibly-defunct status indefinitely. "Unavailable" is reserved for fetch/classification failures with no prior status to carry.
- **FR-022**: The IMF status classification AI call MUST reuse the existing analysis AI client and MUST respect the same cost-cap and safe-logging constraints as the main analysis (its token usage/cost counted toward run telemetry; no prompt/response bodies logged). The call carries only public news text — never portfolio or holdings data.
- **FR-008**: BCRA reserves MUST be captured as **net** reserves when a usable public figure is obtainable; otherwise the system MUST fall back to **gross** reserves, and the reading MUST be explicitly labeled net or gross (stored and displayed) so the two are never conflated.
- **FR-009**: The complete macro panel MUST be stored immutably on the analysis record, supplied to the AI analyst, and displayed on the analysis detail view — unavailable indicators shown as such, never omitted or zeroed.
- **FR-010**: The previous week's macro panel MUST be supplied to the AI analyst alongside the current one so it can reason about week-over-week direction; when no prior panel exists, that absence is stated explicitly.
- **FR-011**: The existing standalone riesgo país fields MUST remain populated (mirrored from the panel) so current views keep working.

#### Portfolio totals

- **FR-012**: System MUST permanently record, on each analysis: total value held in USD, total value held in ARS (native), combined total in USD, unrealized P&L in USD and in ARS, cost basis in USD and in ARS, and the ARS→USD conversion rate used together with its as-of date.
- **FR-013**: Totals MUST be captured from the same portfolio data used for the analysis itself (one consistent view per run) and never recomputed afterward.
- **FR-014**: When the portfolio data was loaded but the analysis subsequently failed, the totals (and any macro readings already gathered) MUST still be preserved on the failed record.

#### Position changes

- **FR-015**: System MUST compute the week's position changes by comparing the previous analysis's position snapshot with the current one, matching positions by broker + asset type + symbol.
- **FR-016**: Each change MUST be classified as added, removed, increased, or reduced, based solely on quantity differences — market price movement alone is not a change — and MUST record quantity before, quantity after, and the delta.
- **FR-017**: The change list MUST distinguish "no changes" (verified empty) from "unknown" (no prior snapshot available, e.g., first run).
- **FR-018**: The change list MUST be stored on the analysis record, displayed on the analysis detail view, and supplied to the AI analyst as precomputed facts for its week-over-week reasoning.

#### Display & access

- **FR-019**: The analysis detail view MUST present three new blocks: the macro panel (grouped Argentina / US / global, each indicator with value, unit, and as-of date), the portfolio totals, and the week's position changes.
- **FR-020**: Analyses created before this feature MUST render without the new data and without errors, clearly indicating the information was not recorded.
- **FR-021**: The analysis read interfaces MUST expose the macro panel, totals, and position changes (including per-position symbols and quantity deltas) for both list and detail consumption (the existing per-position snapshot remains internal). This exposure is accepted as consistent with suggested orders already returned today; the analysis API is treated as private/key-authenticated, not a public surface.
- **FR-023**: External macro data sources MAY require API credentials (e.g., FRED for the US inflation, US policy rate, and S&P 500 series). Any such credential MUST be stored as an application secret and MUST NOT be committed to the repository, consistent with the project's privacy rules.

### Key Entities

- **Macro Context Panel**: the set of nine indicator readings attached to one weekly analysis; each reading = value, as-of date, availability flag (the reserves reading additionally carries a net/gross basis label per FR-008).
- **Portfolio Totals Snapshot**: the aggregate portfolio figures (totals, unrealized P&L, cost basis per currency, conversion rate + as-of) attached to one weekly analysis.
- **Position Change**: one week-over-week difference entry — position identity (broker, asset type, symbol), change type (added/removed/increased/reduced), quantity before/after/delta; a weekly analysis has a list of these (possibly empty or unknown).
- **Weekly Analysis** (existing): extended to carry the three artifacts above; otherwise unchanged (one per Friday, re-runs replace wholesale).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of weekly analyses produced after launch carry a complete macro panel structure — every one of the nine indicators present with either a dated value or an explicit "unavailable" marker.
- **SC-002**: Zero analysis runs fail because a macro indicator could not be fetched (today a single source outage aborts the run).
- **SC-003**: In steady state, at least 7 of the 9 indicators carry real values (not "unavailable") in at least 90% of weekly runs.
- **SC-004**: For any analysis produced after launch, the owner can see the portfolio totals and the week's position changes as they were at generation time, with zero manual recomputation.
- **SC-005**: Position change lists are exact: in test scenarios with known quantity edits, the computed change list matches the edits 100% of the time, with no false entries from price-only movements.
- **SC-006**: Weekly narratives reference at least one macro indicator and, from the second post-launch week onward, at least one week-over-week macro or position observation.

## Assumptions

- **US inflation flavor**: year-over-year headline CPI (the most commonly cited figure). Argentina inflation is the monthly headline print (the figure cited locally).
- **ARG policy rate**: the central bank's policy/reference rate (owner decision; not TAMAR/BADLAR).
- **S&P 500 "high"**: true all-time high, not a rolling window (standard drawdown definition).
- **IMF status states**: a small fixed enum is sufficient; exact state list finalized during planning. Classification is performed by a dedicated AI call (FR-022); a free FRED API key (FR-023) covers the US/global series.
- **List view exposure**: the analysis list keeps its current columns in this iteration; new data is detail-view-only (the list already shows riesgo país via the legacy fields). A summary indicator on the list can be added later without spec change.
- **Totals scope**: per-currency aggregates and the conversion rate only; by-asset-type and by-broker breakdowns are deferred (candidates for the future allocation-drift feature).
- **Mid-week churn invisible**: position changes are snapshot-to-snapshot (analysis to analysis); a change made and reverted within the same week is legitimately invisible. Transaction-level history is out of scope.
- **Owner-managed guidance**: how the AI should *weight* macro signals lives in the owner-editable instructions document (Feature 005); this feature only delivers the data. A suggested instructions snippet will be provided as documentation, not enforced.
- **Dependency**: builds on Feature 005's instruction/analysis pipeline; this feature lands after 005 is merged.
- **Out of scope**: time-series charting dashboard, suggestion execution tracking/scorecard, performance-vs-benchmark reporting, alerting/threshold triggers, backfilling context onto pre-feature analyses, and any manual-entry UI for indicators.
