# Feature Specification: MCP Write Tools for Conversational Portfolio Maintenance

**Feature Branch**: `018-mcp-write-tools`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "MCP write tools for conversational portfolio maintenance. The existing MCP server exposes read-only tools (list_positions, portfolio_summary, list_weekly_analyses, get_weekly_analysis). Extend it so an AI agent session can maintain the portfolio conversationally, closing the loop that today requires the dashboard or one-off scripts. New tools: update_position (partial update), create_position, set_order_execution_status (optionally with execution price for future outcome-P&L), trigger_price_refresh. Guardrails are first-class: no delete tool; large quantity changes require an explicit confirmation flag; every write records a queryable audit trail entry; all tools reuse the existing use-case layer so domain validation cannot be bypassed; null averageCost on update preserves the stored value. Auth: the MCP endpoint already sits behind the platform's system key; no additional auth mechanism in v1."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record what I did with a suggestion, conversationally (Priority: P1)

As the portfolio owner talking to an AI agent, after executing (or skipping) an order the weekly analysis suggested, I tell the agent "I bought those 10 shares at 42.50" and it records the execution status — and the price I got — against that suggested order, so the suggestion scorecard stays current without me opening the dashboard.

**Why this priority**: This is the highest-frequency, lowest-risk write (updating a status field on an existing analysis record), and it directly feeds the existing scorecard plus the planned outcome-P&L work. If only this ships, the feature already pays for itself weekly.

**Independent Test**: Via an agent session, set a suggested order's status to each allowed value with and without an execution price; verify the scorecard reflects it and the audit trail recorded the change.

**Acceptance Scenarios**:

1. **Given** a weekly analysis with a pending suggested order, **When** the agent records it as executed with an execution price, **Then** the order shows executed with that price, and the scorecard's execution rate updates accordingly.
2. **Given** a status value outside the allowed set, **When** the agent attempts to record it, **Then** the write is rejected with a clear message listing the allowed values.
3. **Given** any successful status change, **When** the owner later reviews activity, **Then** an audit entry shows when it happened, which order changed, and the old and new values.

---

### User Story 2 - Adjust a position from a conversation (Priority: P2)

As the portfolio owner, when a holding changes outside the weekly cycle (a partial sale, a corrected cost basis, an updated note or maturity date), I tell the agent and it updates the position directly — with the same validation the dashboard enforces — instead of me writing a one-off script.

**Why this priority**: Position updates are the real maintenance burden today (the sync workflow exists precisely because of them), but they carry more risk than status updates, so they rank below Story 1.

**Independent Test**: Update quantity, notes, and maturity date on an existing position via the agent; verify stored values, validation rejections, guardrail behavior on large changes, and audit entries.

**Acceptance Scenarios**:

1. **Given** an existing position, **When** the agent updates its quantity within the safe threshold, **Then** the stored position reflects the new quantity and an audit entry records old and new values.
2. **Given** an update whose quantity change exceeds the configured percentage threshold, **When** the agent submits it without the explicit confirmation flag, **Then** the write is rejected with a message stating the change size, the threshold, and how to confirm intentionally.
3. **Given** the same oversized update submitted with the confirmation flag, **When** it is applied, **Then** it succeeds and the audit entry notes that confirmation was used.
4. **Given** an update that omits or nulls the average cost, **When** it is applied, **Then** the stored average cost is preserved unchanged (never overwritten by absence).
5. **Given** an update violating domain rules (e.g., negative quantity), **When** submitted, **Then** it is rejected with the same validation message the dashboard path would produce.

---

### User Story 3 - Add a new position conversationally (Priority: P3)

As the portfolio owner, when I open a new holding at a broker, I tell the agent the details and it creates the position with full validation, so new holdings enter the system the moment they exist instead of waiting for the next sync.

**Why this priority**: Less frequent than updates; creation is also partially covered by the sync workflow, so this is a convenience completion of the write surface.

**Acceptance Scenarios**:

1. **Given** valid new-position details, **When** the agent creates it, **Then** the position appears in listings with all provided fields and an audit entry records the creation.
2. **Given** a creation for a broker/symbol/asset-type combination that already exists as an open position, **When** submitted, **Then** it is rejected with a message pointing at the existing position (no silent duplicates).

---

### User Story 4 - Refresh prices on demand (Priority: P3)

As the portfolio owner, after making changes I ask the agent to refresh prices so the portfolio summary I'm looking at reflects current market data, without waiting for the daily scheduled refresh.

**Acceptance Scenarios**:

1. **Given** open positions, **When** the agent triggers a refresh, **Then** the response summarizes how many positions were refreshed and how many failed, and an audit entry records the trigger.

---

### Edge Cases

- **No delete anywhere**: there is deliberately no tool to delete a position, analysis, or audit entry; a "closed" status update is the only way to retire a holding conversationally.
- **Concurrent conflicting writes** (agent and dashboard editing the same position): last write wins, but both writes appear in the audit trail so any surprise is reconstructable.
- **Audit trail growth**: entries accumulate indefinitely in v1; volume is tiny (human-driven writes). Retention policy is out of scope.
- **Price refresh already running** (timer overlap): a concurrent trigger must not corrupt data; it may report that a refresh is already in progress or run redundantly, but never half-update a position.
- **Zero-quantity threshold edge**: reducing a position to zero quantity is always an over-threshold change and therefore always requires the confirmation flag.
- **Threshold configuration invalid or absent**: the guardrail falls back to a conservative default rather than switching off.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The agent interface MUST offer exactly four write operations: partial position update, position creation, suggested-order execution-status recording, and price-refresh trigger. No delete operation of any kind is exposed.
- **FR-002**: Partial position updates MUST accept any subset of: quantity, average cost, notes, status, maturity date; omitted or null fields MUST preserve stored values (explicitly: absent average cost never overwrites the stored cost basis).
- **FR-003**: All writes MUST pass through the same domain validation as the equivalent dashboard/API operations; the agent path MUST NOT be able to persist anything the dashboard path would reject.
- **FR-004**: Quantity changes exceeding a configurable percentage threshold (default: 50% relative change; reduction to zero always counts as exceeding) MUST be rejected unless the request carries an explicit confirmation flag; rejection messages MUST state the change magnitude, the threshold, and the confirmation mechanism.
- **FR-005**: Execution-status recording MUST accept the existing status vocabulary (pending, executed, partial, skipped) and an optional execution price; the price MUST be stored with the order for future outcome analysis.
- **FR-006**: Every successful write MUST produce an audit entry capturing: timestamp, operation type, target (position or order identity), field-level old and new values, and whether a confirmation flag was used. Audit entries MUST be queryable (at minimum: list recent entries).
- **FR-007**: Every rejected write MUST return a self-explanatory message enabling the agent to correct the request without external documentation.
- **FR-008**: The price-refresh trigger MUST reuse the existing refresh behavior and report a summary (refreshed count, failure count) on completion.
- **FR-009**: Creation MUST reject duplicates of an existing open position (same broker, asset type, symbol) with a pointer to the existing record.
- **FR-010**: The write tools MUST require no additional authentication mechanism beyond the existing platform-level key protecting the agent endpoint (v1 posture; endpoint is not publicly reachable without that key).

### Key Entities

- **Audit Entry**: immutable record of one write attempt that succeeded — when, which operation, which target, old vs new values per changed field, confirmation-flag usage.
- **Confirmation Flag**: explicit caller assertion accompanying an over-threshold change; absent by default.
- **Change Threshold**: configurable relative-change limit for quantity updates; conservative default when unconfigured.
- **Execution Price**: optional per-order price recorded alongside execution status; foundation for future outcome-P&L scoring.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can record a suggested order's outcome from a conversation in under 30 seconds, without opening the dashboard, and the scorecard reflects it immediately.
- **SC-002**: 100% of writes performed through the agent interface appear in the audit trail with old and new values; zero writes are unrecorded.
- **SC-003**: Zero writes violating domain validation are persisted via the agent path across the test suite (parity with dashboard-path validation is provable).
- **SC-004**: An over-threshold quantity change without confirmation is rejected 100% of the time, and the rejection message allows the agent to succeed on the retry-with-confirmation without human clarification.
- **SC-005**: After this ships, routine portfolio bookkeeping (status recording, small corrections, new holdings) requires no one-off scripts — measured over a month as zero new `update-*` scripts needed for those operations.

## Assumptions

- The audit trail is a new, append-only record set; its storage design is a planning decision. Nothing existing needs migration.
- The 50% relative-change default threshold (and its configurability surface — an app setting, not a UI) is a starting point the owner can tune; chosen conservatively since a legitimate halving of a position is rare outside explicit rebalancing.
- "Who" in the audit trail is the tool/agent identity, not a user identity — this is a single-user system with one shared key in v1.
- Execution price is stored but not yet used for any scoring; outcome-P&L computation is a separate future feature (roadmap P3-2).
- The trigger-refresh operation may take as long as the existing scheduled refresh; agents are expected to tolerate a slow response rather than the system adding job queuing in v1.
- Closing a position via status update (rather than deletion) matches the existing domain model's open/closed lifecycle.
