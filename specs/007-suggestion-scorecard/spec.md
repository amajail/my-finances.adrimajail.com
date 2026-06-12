# Feature Specification: Suggestion Scorecard (Execution Tracking)

**Feature Branch**: `007-suggestion-scorecard`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Suggestion scorecard — close the loop on the weekly analysis's suggested orders. Let the owner mark each suggested order as executed/partial/skipped (with a note) from the analysis detail page; default 'pending'. Auto-suggest the status by matching each order against the week's computed positionChanges (feature 006). Feed each prior order's execution status into the next analysis's previousAnalysis block so the model stops guessing whether last week's suggestions were acted on. Add a scorecard view showing, over time and by conviction, the execution/hit rate and the P&L of executed vs skipped suggestions. Builds on feature 006. Wrinkle: weekly re-runs replace a date's orders wholesale, which would lose a manually-set execution status."

## Clarifications

### Session 2026-06-12

- Q: How should a manually-set execution status survive a same-week re-run that replaces the date's orders? → A: **Freeze the week once marked** — once any order for a date has a non-pending status, the system blocks re-running that date's analysis unless the owner explicitly forces it (a forced re-run discards the statuses with a clear warning).
- Q: How far does the scorecard's performance comparison go this iteration? → A: **Execution + hit-rate tracking first, defer outcome P&L** — ship execution-rate analytics by conviction now; per-suggestion outcome P&L (needs a reference price + mark-to-market) is a documented follow-up.
- Q: How do auto-proposed statuses (from position changes) apply? → A: **Propose-only** — proposals are displayed but nothing is saved until the owner explicitly confirms (individually or bulk-accept).
- Q: How is a frozen (marked) week re-run, given analyses run via the timer/operator, not a dashboard button? → A: **Permanent freeze, no force** — once any order is marked, the scheduled/triggered run for that date is skipped and statuses preserved; regenerating that week is not supported in the normal flow (it requires an operator to remove the stored record).
- Q: With outcome P&L deferred, what does the scorecard show? → A: **Execution rate + mix only** — executed/partial/skipped counts and rates, overall and by conviction; no outcome/directional signal this iteration.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record what was actually done with each suggestion (Priority: P1)

From the analysis detail page, the owner marks each suggested order with an execution status — executed, partial, or skipped — with an optional short note. Before the owner marks it, an order is "pending". The status is saved and shown whenever that analysis is viewed again.

**Why this priority**: This is the foundation — without a record of what was acted on, there is no feedback loop and no scorecard. It delivers standalone value immediately: a durable log of which AI suggestions the owner took.

**Independent Test**: Open a completed analysis with suggested orders, set each order's status (and a note on one), reload the page, and confirm the statuses and note persisted.

**Acceptance Scenarios**:

1. **Given** a completed analysis with suggested orders, **When** the owner sets an order to "executed", **Then** that status is saved and shown on subsequent views of the analysis.
2. **Given** an order the owner has not touched, **When** the analysis is viewed, **Then** the order shows status "pending".
3. **Given** an order marked "partial" or "skipped" with a note, **When** the analysis is reloaded, **Then** the status and the note are both preserved.
4. **Given** an order's status was set, **When** the weekly analysis for that same date is re-triggered, **Then** the run is skipped and the recorded statuses are preserved — a marked week is permanently frozen; regenerating it is not supported in the normal flow (it requires an operator to remove the stored record).

---

### User Story 2 - The next analysis knows what was executed (Priority: P2)

When the weekly analysis runs, the previous week's suggested orders are provided to the AI analyst **with their execution status**, so its week-over-week reasoning uses facts ("last week's BUY GD41D was executed; the SELL MU was skipped") instead of inferring execution from portfolio diffs.

**Why this priority**: This is the core payoff of closing the loop — it directly improves the quality of the weekly narrative and avoids the model re-suggesting things already done or wrongly assuming a skip.

**Independent Test**: With a prior analysis whose orders have statuses set, run a new analysis and verify the AI inputs include each prior order's execution status; the narrative references it.

**Acceptance Scenarios**:

1. **Given** a prior analysis with order statuses recorded, **When** a new analysis runs, **Then** the prior orders are supplied to the model each annotated with its execution status.
2. **Given** prior orders still "pending" (owner never marked them), **When** a new analysis runs, **Then** they are supplied as "pending" rather than omitted.
3. **Given** a prior analysis from before this feature (no statuses), **When** a new analysis runs, **Then** the run proceeds normally with statuses absent/unknown.

---

### User Story 3 - Auto-propose execution status from the week's position changes (Priority: P2)

The system compares each suggested order against the week's already-computed position changes (feature 006) and proposes a status — e.g. a "buy 12 GD41D" order plus GD41D increased by 12 → propose "executed"; a smaller increase → "partial"; no matching change → "skipped". The owner confirms or overrides.

**Why this priority**: Removes almost all manual effort — most weeks the owner just confirms the proposals. Reuses data feature 006 already persists, so it is cheap.

**Independent Test**: With a prior analysis and a known set of position changes, open the detail page and verify each order shows a sensible proposed status; accept them and confirm the saved statuses match.

**Acceptance Scenarios**:

1. **Given** a suggested "buy N" order and a position change showing that symbol increased by exactly N, **When** the detail page loads, **Then** the order is proposed "executed".
2. **Given** a suggested "buy N" order and a position change showing an increase of less than N (but > 0), **When** the detail page loads, **Then** the order is proposed "partial".
3. **Given** a suggested order with no matching position change, **When** the detail page loads, **Then** the order is proposed "skipped".
4. **Given** proposed statuses are displayed, **When** the owner accepts them (individually or bulk) or overrides one before accepting, **Then** only the accepted/overridden values are saved; nothing is persisted until the owner confirms.

---

### User Story 4 - Scorecard: is the AI actually helping? (Priority: P3)

A scorecard view summarizes, across all completed analyses and broken down by conviction level (low / medium / high), how often suggestions were executed vs skipped and how those choices performed, so the owner can judge whether following the analysis improves gains.

**Why this priority**: The ultimate goal — but it depends on US1/US2 accumulating data over several weeks, so it lands last.

**Independent Test**: With several analyses whose orders have statuses, open the scorecard and verify the execution rate and performance figures aggregate correctly by conviction.

**Acceptance Scenarios**:

1. **Given** multiple analyses with recorded statuses, **When** the owner opens the scorecard, **Then** it shows the execution rate (executed / total suggestions) overall and by conviction.
2. **Given** executed and skipped suggestions across weeks, **When** the owner opens the scorecard, **Then** it shows the executed / partial / skipped breakdown by conviction (outcome P&L per suggestion is a documented later iteration, not computed here).
3. **Given** there are too few data points (e.g. first week), **When** the owner opens the scorecard, **Then** it degrades gracefully (shows counts, indicates insufficient history for rates).

---

### Edge Cases

- **Re-run after marking**: a marked week is permanently frozen (FR-004) — any re-triggered run for that date is skipped, never silently losing owner input.
- **Quantity mismatch direction**: a SELL suggestion matched against a *decrease* is "executed"; matched against an *increase* is not a match (→ skipped).
- **Multiple orders, same symbol**: if two suggestions touch the same symbol, the proposal logic must not double-count one position change (resolved greedily; residual ambiguity acceptable for a single-user tool).
- **Partial with no number**: "partial" may be recorded as a label without capturing the exact executed quantity unless clarified otherwise.
- **Owner edits positions late**: position changes are detected at the next run; if the owner marks status before updating positions, a later auto-proposal may differ — the manual mark wins.
- **Pre-feature analyses**: orders without a status render as "pending"/"unknown" and are handled without error.
- **Failed analyses**: failed runs have no orders, so there is nothing to score.

## Requirements *(mandatory)*

### Functional Requirements

#### Recording execution status

- **FR-001**: The system MUST let the owner set an execution status on each suggested order of a completed analysis, chosen from: pending (default), executed, partial, skipped.
- **FR-002**: The system MUST allow an optional free-text note per order alongside its status.
- **FR-003**: Execution status and note MUST persist and be shown on every later view of that analysis.
- **FR-004**: Once any order for an analysis date has a non-pending execution status, the system MUST permanently block re-running that date's analysis — a re-triggered run for that date is skipped and the recorded statuses are preserved. Regenerating such a week is not supported in the normal flow (it requires an operator to remove the stored analysis record, which discards its statuses). No in-app "force" path exists.
- **FR-005**: Each saved status MUST record when it was last changed. Saved statuses are owner-confirmed (nothing is auto-saved — see FR-006/FR-007).

#### Auto-proposal from position changes

- **FR-006**: The system MUST compute and DISPLAY a proposed execution status for each pending order by comparing it to the week's computed position changes (feature 006), matching by symbol and side: full matching quantity → executed; smaller same-direction change → partial; no matching change → skipped. Proposals are not persisted on their own.
- **FR-007**: The owner MUST be able to accept the displayed proposals (individually or in bulk) or override any of them; only on the owner's confirmation is a status saved. No status is persisted without owner confirmation.
- **FR-008**: When position changes are unavailable for a week (unknown / first run), the system MUST show all orders as "pending" with no proposal.

#### Feeding the next analysis

- **FR-009**: When an analysis runs, each previous-week suggested order supplied to the AI analyst MUST be annotated with its execution status (pending when unmarked).
- **FR-010**: Prior analyses produced before this feature (no statuses) MUST be handled without error (status treated as unknown/pending).

#### Scorecard

- **FR-011**: The system MUST present a scorecard summarizing, across completed analyses, the execution rate (executed vs total suggestions) overall and broken down by conviction level.
- **FR-012**: The scorecard MUST show the executed / partial / skipped breakdown by conviction. No outcome or directional performance signal is computed in this iteration — per-suggestion outcome P&L (it requires a reference price captured at suggestion time plus mark-to-market) is explicitly OUT of scope and recorded as a follow-up.
- **FR-013**: The scorecard MUST degrade gracefully when history is too short to compute meaningful rates (show counts; indicate insufficient data).

#### Access & display

- **FR-014**: The analysis detail view MUST show, per order, its saved status and note (and, for pending orders, the system's proposed status), with controls to set/accept/override the status and edit the note.
- **FR-015**: The read interfaces MUST expose order execution status so both the detail view and the scorecard can consume it.

### Key Entities

- **Order Execution Status**: the execution outcome attached to one suggested order — status (pending/executed/partial/skipped), optional note, last-updated timestamp. Saved values are owner-confirmed. Belongs to a specific analysis date + order.
- **Suggested Order** (existing, feature 002): gains an associated execution status.
- **Scorecard**: a computed (not stored) aggregation over orders across analyses — execution rate and performance, grouped by conviction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can record the execution status of every order in a week's analysis in under 30 seconds total (with auto-proposals, typically just confirming).
- **SC-002**: 100% of analyses produced after launch supply prior-week orders to the model annotated with an execution status.
- **SC-003**: Execution status set by the owner survives a same-week re-run with zero loss.
- **SC-004**: For clear cases (an order whose symbol/side/quantity exactly matches a position change), the auto-proposal matches the correct status in at least 95% of cases in testing.
- **SC-005**: The scorecard reports execution rate by conviction across all completed analyses, and remains correct (no crash, clear "insufficient data" state) from the very first week.
- **SC-006**: After several weeks, the owner can see — by conviction, without manual spreadsheet work — how often they acted on suggestions and the executed/partial/skipped mix. (Outcome-based "worth following" P&L is a documented follow-up, not this iteration.)

## Assumptions

- **Single user**: the owner is the only actor; no multi-user roles or permissions.
- **Annotation, not execution**: marking an order "executed" records what happened; it does NOT itself modify position holdings. The owner continues to update positions separately (as today), and those updates are what feature 006 detects as position changes the following week.
- **Conviction is the primary cut**: the scorecard groups by the order's conviction (low/medium/high); per-broker or per-asset-type cuts are out of scope for this iteration.
- **Matching granularity**: the proposal matches by symbol + side + quantity against the week's position changes; same-symbol multiple-order ambiguity is resolved greedily and is acceptable for a single-user tool.
- **Partial detail**: "partial" is a label; capturing the exact executed quantity is optional and deferred.
- **Re-run is rare after marking**: the freeze-once-marked rule assumes the owner marks a week after the run settles. There is no in-app force path; regenerating a frozen week is an out-of-flow operator action (delete the record).
- **Dependency**: builds on feature 006 (suggested orders, persisted position changes, portfolio totals); lands after 006 is in production (it is).
- **Out of scope**: per-suggestion outcome P&L / returns (deferred follow-up), automated trade execution, broker integration, editing past *suggestions* (only their execution status is mutable), alerting, and backfilling statuses onto historical analyses.
