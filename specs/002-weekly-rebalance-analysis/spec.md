# Feature Specification: Weekly LLM Portfolio Rebalance Analysis

**Feature Branch**: `feature/weekly-rebalance-analysis`

**Created**: 2026-05-16

**Status**: Draft

**Input**: User description: "Every Friday after the US market closes, automatically generate a written portfolio rebalance analysis using a large language model. The analysis must consider the current portfolio, Argentina country-risk context, and the previous week's recommendations, and produce both a markdown narrative and a structured list of suggested buy/sell/hold orders that the owner can read on the dashboard."

## Clarifications

### Session 2026-05-16

- Q: Should suggested orders carry a per-order status that the owner marks "executed" or "skipped" from the dashboard? → A: No. The owner updates the portfolio manually after acting on a suggestion; per-order status is not tracked. The dashboard's per-analysis page is a read-only viewer.
- Q: Should the system expose an application-level HTTP endpoint for the operator to manually trigger an analysis run? → A: No. Manual recovery is performed via the Azure platform's "Test / Run" affordance on the timer function. No new HTTP endpoint is added for triggering runs.
- Q: Should each weekly analysis persist a structured snapshot of the portfolio as it stood at run time, to anchor next week's portfolio-delta inference? → A: Yes — persist a full structured per-position snapshot (per-position quantity, average cost, current price, currency) on every weekly analysis record. Next week's prompt receives this snapshot alongside the current portfolio so the LLM can compute exact per-position deltas.
- Q: Where does the standing target-allocation framework (bucket targets, deploy-priority rankings, and position-level directives) live? → A: Inside the versioned prompt template document, as content. The framework is not promoted to persisted, queryable entities; editing it is a content edit on the prompt template, producing a new prompt template version stamped onto subsequent runs.
- Q: How are cross-bucket transfers (e.g., USD cash from IBKR funding an ARG-bucket trade) flagged on a suggested order, and does the system enforce a constraint against unflagged cross-bucket trades? → A: They are not flagged on the order schema and the system does not enforce a constraint. The LLM's only view of any bucket-level capital movement between runs is recovered from comparing the per-position portfolio snapshots of consecutive runs. The three-bucket framing (US/ARG/OffSystem) remains descriptive context the LLM uses in its strategic reasoning, but it is not a system-enforced output constraint.
- Q: Should the suggested-order schema include a `hold` side in addition to `buy` and `sell`? → A: No. The order side enum is `buy | sell` only. Hold-style commentary on individual positions belongs in the narrative body's portfolio-assessment section, not as rows in a table that reads as a list of actions to take. An empty orders table (or "no actions recommended" copy) remains a valid run outcome.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A written analysis with concrete buy/sell suggestions appears every Friday (Priority: P1)

As the portfolio owner, I want a fresh strategic analysis of my real holdings to appear on the dashboard once a week, automatically, after the US market closes on Friday, so that I start every weekend with a current read on what to do with the portfolio without having to assemble the inputs myself.

**Why this priority**: This is the core value. Today no such weekly read exists — assembling current holdings, Argentina country-risk context, and a strategic view costs me real time on weekends. A single artifact that does it for me is the headline deliverable; without it nothing else in this feature matters.

**Independent Test**: After a Friday close, without taking any action, open the dashboard's analysis page. The latest report dated for that Friday is listed; clicking into it shows a narrative covering current portfolio state, market context (riesgo país, US conditions), week-over-week portfolio assessment, and a structured table of suggested orders. Each suggested order names a broker, a symbol, a side (buy or sell), a quantity, a rationale, and a conviction level. Hold-style commentary on individual positions appears in the narrative body, not as rows in the orders table.

**Acceptance Scenarios**:

1. **Given** the system is deployed and last week's analysis row exists (or none does — first run), **When** Friday's scheduled run fires after the US market close, **Then** within a few minutes a new analysis report dated for that Friday appears in the dashboard's analysis list with a written body and at least one row in its suggested-orders table (or an explicit "no actions recommended" message).
2. **Given** the new analysis report exists, **When** the portfolio owner opens its detail page, **Then** the page shows the report's narrative as rendered markdown and a read-only suggested-orders table where each row clearly shows broker, symbol, side, quantity, conviction, and rationale.
3. **Given** a suggested order targets an Argentine sovereign bond, **When** the portfolio owner reads its rationale, **Then** the rationale references the per-100-nominales pricing convention and acknowledges expected commission + IVA where applicable.
4. **Given** Argentina riesgo país is above 600 basis points at the time of the run, **When** the analysis is generated, **Then** the narrative explicitly notes that the trigger is active and reflects that in the deploy preference for free USD cash (preferring a short-duration US instrument over adding duration in long Argentine sovereigns), unless the analysis explicitly argues against the default with a rationale.

---

### User Story 2 — Next week's analysis sees last week's suggestions and the resulting portfolio state (Priority: P2)

As the portfolio owner, I want next week's analysis to receive both last week's suggested orders and the current portfolio (which I update manually after acting on trades), so that — by comparing the two — the assistant can reason about which prior suggestions appear to have been acted on and adjust its thesis without me having to mark anything by hand.

**Why this priority**: This is what turns the feature from "weekly Monte Carlo" into a coherent multi-week dialogue. Without it Story 1 still ships value (one-shot weekly read), but the feature degrades over time. Because the owner updates the portfolio manually as part of executing trades, the portfolio state itself is the signal of what was acted on.

**Independent Test**: Run two consecutive weekly analyses. Between runs, simulate the owner executing one of week 1's suggested orders by manually updating the corresponding position (or by leaving the portfolio unchanged to simulate a skipped suggestion). In week 2's narrative, the LLM should explicitly identify the delta between last week's portfolio (as recorded in last week's analysis) and the current one and comment on which prior suggestions appear consistent or inconsistent with that delta.

**Acceptance Scenarios**:

1. **Given** week 1's analysis suggested an order and the owner subsequently updated the portfolio in a way consistent with that order being executed, **When** week 2's run executes, **Then** the prompt receives week 1's structured portfolio snapshot alongside week 2's current portfolio, and the week-over-week section of the narrative explicitly identifies the per-position delta and reasons forward from the new state.
2. **Given** week 1's analysis suggested an order and the owner did NOT update the portfolio, **When** week 2's run executes with market context substantially unchanged, **Then** the narrative does not silently repeat the same suggestion with the same rationale; if the same trade is still warranted, it explains *why again this week* (e.g., still applicable, market context evolved, urgency increased).
3. **Given** between week 1 and week 2 at least one position has changed for any reason (trade, organic price move, dividend), **When** week 2's run executes, **Then** the narrative's week-over-week section acknowledges the change explicitly and does not silently treat the new state as if it were last week's state.

---

### User Story 3 — Failed runs are surfaced on the dashboard, not silent (Priority: P3)

As the portfolio owner, I want a scheduled run that fails (model unavailable, country-risk source unreachable, structured-output parsing error) to leave a visible "failed" entry on the analysis list with the reason, so that I notice the absence and can intervene rather than discovering silent gaps a month later.

**Why this priority**: Quality-of-life observability. The feature can ship without this in the first slice (logs alone would tell me), but surfacing on the dashboard closes the loop without needing me to read logs.

**Independent Test**: Force a failure in any prerequisite (e.g., disconnect the country-risk source). The run still produces a dated entry on the dashboard, marked "failed", with a short error reason. No partial/corrupt "successful" entry is written, and no suggested orders appear under that failed entry.

**Acceptance Scenarios**:

1. **Given** the country-risk source is unreachable at run time, **When** the scheduled run fires, **Then** the dashboard's analysis list shows a row for that Friday with status "failed" and a short human-readable reason; no suggested orders are listed under it.
2. **Given** the model returns a response that cannot be parsed into the required structured shape, **When** the run completes parsing, **Then** the analysis row is persisted as "failed" with the parsing error reason, and the previous week's analysis remains untouched.
3. **Given** the run exceeds the configured token-cost cap, **When** the cap is reached, **Then** the run aborts cleanly, persists a "failed" row with reason "cost cap exceeded", and does NOT produce suggested orders.

---

### Edge Cases

- **First run ever (no previous analysis to compare against)**: The system MUST still produce a complete weekly report; the prompt MUST handle "no previous analysis" gracefully and not refuse or error. The week-over-week section of the narrative MUST instead note that there is no prior week to compare against.
- **Friday is a US market holiday or NYSE early-close day**: The scheduled run still fires on Friday at the configured time. The narrative MAY note the holiday context; failure to refresh prices upstream MUST not silently corrupt the analysis (the report must reflect whichever prices were the most recent available).
- **Argentina country-risk source returns stale data (e.g., last value is several days old)**: The run still completes; the narrative MUST surface that the country-risk reading is stale and date it explicitly, rather than silently treating it as current.
- **Portfolio has zero open positions**: The run still completes and produces a report; the suggested-orders table may be empty or contain only "no actions recommended" rationale.
- **Same calendar date receives multiple runs (e.g., the operator re-invokes the timer from the Azure portal after the scheduled run completed)**: Each re-run fully overwrites that date's analysis record and replaces its suggested orders with the latest run's output. Because suggested orders carry no owner-managed state, no order data is lost in this overwrite that the system was responsible for preserving.
- **A suggested order falls below the broker's operational minimum** (e.g., a sub-USD-100 trade at BullMarket): The analysis MUST either omit the order or explain in the rationale why it is still being suggested despite the minimum.
- **The owner has not opened the dashboard in several weeks**: All weekly reports MUST be retained and individually openable; week-over-week reasoning in newer reports MUST handle the situation where multiple prior weeks of suggestions have piled up (any of which may or may not have been acted on, with the portfolio state as the only evidence either way).
- **Run is still in progress when the next trigger fires** (e.g., the scheduled run is slow and the operator initiates a portal "Test / Run" while it is still working): The second invocation MUST be rejected or de-duplicated; concurrent writes to the same date's records MUST NOT occur.

## Requirements *(mandatory)*

### Functional Requirements

#### Scheduling and triggering

- **FR-001**: System MUST automatically generate a weekly portfolio rebalance analysis once per week, on Friday, approximately 1 hour after the US stock market regular-hours close.
- **FR-002**: System MUST respect US daylight-saving transitions so that the Friday run continues to land at the intended hour relative to the US market close year-round.
- **FR-003**: System MUST NOT execute two runs concurrently against the same target date; if one run is in progress when another fires (e.g., the timer fires while a previous portal-initiated invocation is still working), the second MUST be rejected or de-duplicated.

#### Inputs to the analysis

- **FR-004**: Each run MUST assemble, as inputs to the analysis: the current portfolio state (brokers, open positions, quantities, average cost, currency mix, current prices including the most recent MEP conversion already computed by the existing portfolio summary), the previous week's analysis record (its narrative body, its suggested orders, and the structured portfolio snapshot it persisted at run time — see FR-019a), and the current Argentina country-risk reading from a public source, along with the date that reading was last updated.
- **FR-004a**: Each run MUST capture a structured snapshot of the portfolio at run time as one of its persisted outputs (see FR-019a). The snapshot is the deterministic anchor that next week's run uses to compute per-position deltas; it is captured from the same portfolio data the analysis itself was conditioned on.
- **FR-005**: System MUST source Argentina country risk from a public source that does not require credentials and that returns a machine-readable response; if the source is unreachable within a short timeout the run still completes but MUST surface the failure to fetch in the analysis row's status or in the narrative (not silently substitute a stale or zero value as if current).
- **FR-006**: System MUST stamp each persisted analysis row with the identifier of the prompt template version used, so that future revisions of the prompt can be compared post-hoc.

#### Output produced by the analysis

- **FR-007**: Each successful run MUST produce both a free-form narrative report (markdown) and a structured list of suggested orders. The list MAY be empty when the analysis concludes no action is warranted.
- **FR-008**: Each suggested order MUST include: target broker (matching one of the known broker identifiers), symbol, side (one of: buy, sell), quantity, free-text rationale, and a conviction level (one of: low, medium, high). The suggested-orders table is reserved for action-suggesting rows; hold-style commentary on individual positions belongs in the narrative body (FR-010's portfolio-assessment section), not in the orders table.
- **FR-009**: Each suggested order's rationale MUST cite the basis for the suggestion — at minimum one of: allocation drift, a standing position directive, an active trigger condition, or new market context surfaced in the narrative.
- **FR-010**: The narrative MUST include an executive summary, a market-context section that names the current Argentina country-risk reading and how it compares to the trigger threshold of 600 basis points, a portfolio-assessment section, and a week-over-week section that explicitly compares the current portfolio state to the prior week's state and comments on which prior suggestions appear consistent with the observed delta (omitted on the first-ever run, where it MUST instead note that there is no prior week to compare against).

#### Domain rules the analysis MUST respect

- **FR-011**: The analysis MUST be aware of the three-bucket framing of the portfolio — US (IBKR-held US equities, ETFs, US T-bills), ARG (Argentina-jurisdiction positions: sovereign bonds, BOPREALs, CEDEARs, ARS LECAPs, ARS/USD cash at IOL/Galicia/BullMarket), and OffSystem (physical USD cash held outside any broker) — because the standing target allocation and deploy-priority framework (FR-013) are organized by bucket. The system does NOT enforce a cross-bucket transfer flag on individual suggested orders and does NOT track transfers as a distinct concern; the LLM's view of any bucket-level capital movement that occurred between runs is recovered from comparing the per-position portfolio snapshots (FR-019a) of consecutive runs.
- **FR-012**: The analysis MUST treat the Argentina country-risk threshold of 600 basis points as a strategic signal: when the reading is above 600 bp the default preference for deploying free USD cash is a short-duration US instrument (SGOV) over adding duration in long Argentine sovereigns (GD41D); when at or below 600 bp the default preference for ARG-bucket deployment is GD41D. The analysis MAY override either default but MUST state the override rationale.
- **FR-013**: The analysis MUST weigh the owner's standing strategic framework — bucket-level target allocations (e.g., US / ARG / OffSystem percentages and their sub-class breakdowns), deploy-priority rankings within each bucket (which symbols receive freshly available cash first, with per-symbol caps), and position-level directives (ADD on an underweight position, TRIM by a stated percentage on a profit-taking thesis, HOLD on a position under review, CLOSE on a position to be migrated). The entire framework is part of the prompt template content — not persisted as queryable entities — and is updatable by the owner by editing the prompt template document. Each material edit produces a new prompt template version that is stamped onto subsequent runs.
- **FR-014**: The analysis MUST observe operating conventions of the portfolio: bonds (sovereigns, BOPREALs) are quoted per 100 nominales (% of par); ARS positions are valued in USD via the MEP rate that the portfolio summary already provides; Galicia is the preferred broker for ARG sovereign bonds; bonds used for MEP liquidity (GD30, AL30) MUST NOT be suggested for closure to fund unrelated trades without an explicit override; commissions and IVA (21% on ARS trades) MUST be acknowledged in the rationale of any ARS-denominated suggested order.
- **FR-015**: The analysis MUST NOT emit a suggested order whose quantity falls below the operating minimum at the target broker, unless the rationale explicitly justifies the sub-minimum suggestion.
- **FR-016**: The analysis MUST NOT propose selling a cash position or the OffSystem USD reserve as a means of deploying capital elsewhere.
- **FR-017**: For positions that are known to be illiquid (e.g., obscure or thinly traded bonds), the analysis MUST flag the position for manual verification rather than proposing an order against it as routine.
- **FR-018**: The analysis MUST NOT propose more than 25% of the portfolio's total value to be rotated in a single week unless the rationale for the rotation explicitly carries conviction level "high".

#### Persistence and state

- **FR-019**: System MUST persist each run's outcome as exactly one analysis record keyed by the target date, including: the narrative body, the prompt version used, the model identifier used, the country-risk reading and its as-of date, run status (one of: completed, failed), and on failure, a short human-readable reason.
- **FR-019a**: Each persisted analysis record MUST include a structured portfolio snapshot — the list of open positions as they stood at run time, each with at minimum its broker, asset type, symbol, quantity, average cost, currency, and the current price used for valuation at run time. The snapshot MUST be persisted even when run status is "failed", provided the failure occurred after the portfolio inputs were assembled (so that the next run can still anchor its delta inference); if the failure occurred before the portfolio was read, the snapshot field MAY be empty.
- **FR-020**: System MUST persist the suggested orders produced by a run as records associated with the parent analysis record. Suggested orders are immutable artifacts of the run that produced them — their fields are not edited by user action, and no per-order status is tracked.
- **FR-021**: Re-running the analysis for an existing target date MUST overwrite that date's analysis record and replace its suggested orders with the new run's output. There is no merge-with-prior-state semantics because no per-order state survives between runs.
- **FR-022**: System MUST retain all past analyses indefinitely (no automatic deletion); the dashboard MUST be able to display the historical list.

#### Dashboard surface

- **FR-023**: Dashboard MUST present a listing page that shows past weekly analyses in reverse-chronological order, surfacing at minimum each row's date, status (completed/failed), and a brief one-line summary.
- **FR-024**: Dashboard MUST present a per-analysis detail page that renders the narrative body and a read-only table of that analysis's suggested orders. The per-analysis page MUST NOT expose controls to modify, mark, re-run, or trigger anything; it is a read-only artifact viewer.

#### Reliability and cost

- **FR-025**: System MUST enforce a hard cap on the total LLM input and output token volume per run; if the cap is reached the run MUST abort cleanly and persist a "failed" record with the cap as the reason, rather than continuing.
- **FR-026**: System MUST log per-run metadata sufficient for cost and quality observability — at minimum: run date, model identifier used, input and output token counts, USD cost, count of suggested orders produced, status, duration, and on failure the short error reason. These logs MUST NOT contain the prompt body or the model response body.
- **FR-027**: System MUST persist per-run token counts and USD cost alongside the analysis record so that the dashboard MAY surface running cost trends without rummaging through logs.

#### Privacy and security

- **FR-028**: Real holdings data (broker identities, symbols, quantities, cost basis, prices) MUST flow through an external LLM service only as part of the analysis pipeline. The use of an external LLM service for this purpose is an explicitly acknowledged privacy boundary that MUST be documented in the project's governing record (e.g., the project constitution or equivalent).
- **FR-029**: The integration with the external LLM service MUST include a sanitization layer that prevents the prompt body or response body from being captured in operational logs / observability sinks. Only the per-run metadata listed in FR-026 may be captured.
- **FR-030**: Credentials for the external LLM service MUST be supplied through environment configuration only (never hard-coded, never checked into source control).
- **FR-031**: The choice of model used for analysis MUST be configurable without a code change (e.g., via a settings record), with a sensible default.

### Key Entities

- **Weekly analysis**: One record per weekly run, keyed by the target Friday's date. Stores the narrative body, the prompt template version used, the model identifier used, the country-risk reading captured at run time and its as-of date, the structured portfolio snapshot captured at run time (per-position quantity, average cost, current price, currency, broker, asset type, symbol — see FR-019a), run status (completed or failed), failure reason if applicable, and per-run cost telemetry (input tokens, output tokens, USD cost, duration).
- **Suggested order**: One record per individual buy or sell suggestion produced by an analysis run, owned by (i.e., associated with) the parent analysis. Carries the broker, symbol, side (buy or sell), quantity, rationale, and conviction. Hold-style commentary is not recorded here — it lives in the parent analysis's narrative body. Suggested orders are immutable artifacts: they are written when the parent analysis is written and are not modified by user action.
- **Prompt template**: A versioned text document that defines the role, inputs, conventions, required output shape, and guardrails the analysis must respect. Each weekly run records which version it used. New versions are introduced explicitly by editing the source document; A/B comparison across versions is post-hoc only.
- **Country-risk reading**: A snapshot value of Argentina country risk in basis points and the date that value is as-of, captured at run time from a public source and stored alongside the analysis it informed.
- **Portfolio settings**: Existing settings store that supplies the configured model identifier (and other future tunables); read once per run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On at least 95% of Fridays the dashboard's analysis list shows a new, completed analysis dated for that Friday and posted within 30 minutes of the configured run time.
- **SC-002**: The portfolio owner performs zero manual actions per week to obtain the analysis under normal operation.
- **SC-003**: For at least 90% of suggested orders, the owner can identify the basis of the suggestion (drift / directive / trigger / new context) from the rationale text alone, without referring back to the prompt template.
- **SC-004**: When the current portfolio state has materially changed between week N and week N+1 (a position quantity differs in either direction), week N+1's narrative explicitly acknowledges the change in its week-over-week section in 100% of cases.
- **SC-005**: No single weekly run consumes more than the configured per-run token/cost cap; the running 12-week average cost per run stays within ±20% of the planned default-model budget.
- **SC-006**: Zero weekly-analysis records contain the prompt body or the model response body in any observability sink that captures operational logs.
- **SC-007**: When the country-risk reading is above 600 bp at run time, at least 95% of suggested orders that deploy free USD cash in that run choose a short-duration US instrument over adding duration in a long Argentine sovereign — or explicitly justify the deviation in their rationale.

## Assumptions

- **Schedule and timing**: A weekly cadence on Friday, ~1 hour after the US market close, is the right rhythm for a strategic (not tactical) read. Intraday or daily strategic re-runs are explicitly out of scope.
- **Single unified report**: One report covers the whole portfolio across US, ARG, and OffSystem buckets; ARS-only and USD-only sub-reports are out of scope.
- **External LLM service**: The system relies on an external LLM service for the strategic-reasoning step. This is the first feature where real holdings flow off-machine. The provider is treated as a trusted data-handling counterparty governed by its own data-retention policy; the project's governing record (constitution) is updated to formally acknowledge this boundary. No human at the provider routinely reads the data; logs at the system side never capture the prompt or response body.
- **Country-risk source**: A free public Argentina country-risk JSON source (no credentials required) is sufficient for FR-005. Source identity is treated as a substitutable input; if it goes away the integration is rebuilt against an equivalent.
- **Model default**: A default model is preselected as a sensible cost/quality balance; the owner can change it through a settings record without code changes. Approximate cost expectation: a few US dollars per month at one run per week with default model.
- **Reuse of existing portfolio plumbing**: The current portfolio-summary computation (brokers + positions + MEP conversion + most recent current prices), portfolio analytics (weights, top performers, unrealized P&L), and the existing pattern for fetching from external HTTP providers (injectable fetcher, bounded timeout) are reused as inputs rather than redesigned. The Friday timer reuses the same time-zone wiring already in production for the daily price refresh.
- **Manual recovery via the Azure platform**: When intervention is required (debugging, recovery from a missed scheduled run, ad-hoc re-execution), the operator invokes the timer function from the Azure portal's "Test / Run" affordance. No application-level HTTP endpoint exists for triggering analysis runs from outside the dashboard or by external callers.
- **Re-runs are destructive overwrites**: A repeated run for the same target date overwrites that date's narrative and replaces its suggested orders with the new run's output. Because suggested orders carry no owner-managed state on the dashboard, no user data is lost in this overwrite — any actual trades the owner executed are recorded in the portfolio itself, not in the orders table.
- **Portfolio state is the signal of what was acted on**: The owner updates positions manually after executing trades. The next weekly analysis sees the resulting portfolio state (and the prior week's suggested-orders record) and infers what was acted on by comparing them. No per-order "executed" or "skipped" flag is recorded.
- **The standing strategic framework is content, not code**: Bucket target allocations, deploy-priority rankings, and position-level directives all live inside the versioned prompt template document. The framework is not modeled as persisted, queryable entities on day 1. Editing it is a content edit on the prompt template that produces a new version stamped onto subsequent runs. If a future feature requires a non-LLM consumer to query targets (e.g., a dashboard "drift from target" badge), they can be promoted to persisted entities then.
- **Failure visibility over silent gaps**: Failed runs are persisted and surfaced on the dashboard rather than hidden; a missing Friday entry should signal an infrastructure problem (e.g., the scheduler itself), not a quietly-swallowed model error.

## Out of Scope *(intentional non-goals)*

- **Auto-execution of orders via broker APIs**: Orders are advisory only. The system never places, modifies, or cancels trades on the owner's behalf.
- **Separate ARS-only or USD-only analyses**: One unified weekly report covers the whole portfolio. Per-currency split reports are not produced.
- **Real-time dashboard updates** (WebSockets, live refresh): A static page render after navigation is sufficient; the dashboard is not expected to reflect new analyses without a reload.
- **Running two prompt-template versions in parallel against the same run** to A/B them. Only one version per run; post-hoc comparison across runs is the supported workflow.
- **Backtesting or simulation** of past suggested orders against historical prices. Suggestions are forward-looking only.
- **A user-facing manual-refresh button** for analyses on the dashboard, mirroring the deliberate removal of the manual price-refresh button in the prior feature.
- **Pre-trade order ticket generation** (FIX messages, broker-specific order payloads, copy-paste templates per broker). The suggested-orders table is the deliverable; translating it into an actual broker order is the owner's manual step.
- **An operator-facing HTTP endpoint for manually triggering an analysis run**. Operators use the Azure portal's "Test / Run" affordance on the timer function instead; no new application endpoint is added.
- **Per-order status tracking on the dashboard** (marking an individual suggested order as "executed" or "skipped"). The owner records execution by updating the portfolio itself; the next run reasons from the portfolio delta.
