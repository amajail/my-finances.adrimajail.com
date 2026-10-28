# Feature Specification: Stale and Unrecorded Order Handling

**Feature Branch**: `020-stale-order-handling`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Stale and unrecorded order handling in the weekly analysis. Observed over 8 consecutive weekly analyses: the same low-conviction suggested orders (a recurring ETF buy and a dust-stub sell) are re-issued unchanged week after week with executionStatus 'pending', even though later analysis narratives report the position changes as having happened, so 'pending' means 'not recorded' rather than 'skipped' and the analysis cannot tell executed from skipped. Goal: feed prior orders' age and status into the weekly analysis input, drop or escalate (ask the owner to confirm) any order still pending after more than 3 weeks instead of silently re-issuing it, and review whether OrderExecutionMatcher can infer fills from position quantity changes."

> Privacy: this spec uses placeholders only (`SYMBOL`, `BROKER`, `N`). No real quantities, prices or holdings appear here (constitution §I).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The analysis knows what it already suggested (Priority: P1)

When the weekly analysis runs, it is told which orders it suggested in recent weeks, how old each one is (in weeks) and what the recorded status of each is. It uses this to avoid re-issuing an identical suggestion as if it were new, and says in the narrative when a suggestion is a carry-over.

**Why this priority**: This is the root of the observed problem. Without prior-order context the analysis cannot distinguish a fresh idea from a stale one, so every other behaviour in this feature depends on it.

**Independent Test**: Run an analysis for a week where the previous week had one `pending` buy for `SYMBOL` at `BROKER`. Confirm the analysis input contains that order with its age and status, and that the output either marks the repeated order as a carry-over (with its age) or does not repeat it.

**Acceptance Scenarios**:

1. **Given** a prior analysis with a `pending` order for `SYMBOL` at `BROKER`, **When** the next weekly analysis runs, **Then** the analysis input lists that order with its originating week, age in weeks and recorded status.
2. **Given** an order that was suggested in each of the last 2 weeks and is still `pending`, **When** the analysis re-suggests it, **Then** the suggestion is labelled as a carry-over and states its age in weeks.
3. **Given** no prior orders exist (first run), **When** the analysis runs, **Then** it proceeds exactly as today with an empty prior-orders section.

---

### User Story 2 - Orders pending too long are escalated, not silently re-issued (Priority: P1)

An order that has stayed `pending` for more than 3 weeks is no longer repeated as a normal suggestion. Instead the weekly analysis surfaces it in a distinct "needs your confirmation" item that asks the owner whether it was executed, skipped or is still wanted.

**Why this priority**: Silent re-issue of an unchanged order for 4 to 8 weeks is the observable defect. Escalation turns an ambiguous status into an owner decision.

**Independent Test**: Seed prior analyses so that one order has been `pending` for 4 consecutive weeks. Run the analysis and confirm the order is not issued as a normal order and appears in the confirmation item with its age.

**Acceptance Scenarios**:

1. **Given** an order `pending` for more than 3 weeks, **When** the analysis runs, **Then** it is not re-issued as a normal suggested order and is listed under a clearly labelled item asking the owner to confirm its outcome.
2. **Given** an order `pending` for exactly 3 weeks, **When** the analysis runs, **Then** it may still be re-issued as a labelled carry-over (threshold is "more than 3 weeks").
3. **Given** the owner records the order as `executed` or `skipped`, **When** the next analysis runs, **Then** the order no longer appears as pending or in the confirmation item.
4. **Given** the analysis judges that a stale order is still wanted, **When** the owner confirms it, **Then** it can be re-issued as a fresh order with its age reset.

---

### User Story 3 - Fills are inferred from position changes (Priority: P2)

When a prior order is still `pending` but the portfolio's recorded position changes show the matching buy or sell happened, the system proposes marking it executed (or partial) so that "pending" stops meaning "not recorded". The owner confirms before anything is saved.

**Why this priority**: It removes the cause of stale orders at the source and makes the age/status data trustworthy, but the feature already delivers value from Stories 1 and 2 without it. It extends existing propose-only matching, which today compares an order only with position changes of its own week.

**Independent Test**: Take a `pending` buy for `SYMBOL` at `BROKER` from week W. Provide a later week W+k whose position changes include an increase for that `SYMBOL` and `BROKER`. Confirm a proposal of `executed` (or `partial` when the increase is smaller than the order) is produced for the owner to confirm, and nothing is saved without confirmation.

**Acceptance Scenarios**:

1. **Given** a `pending` buy and a later week whose position changes increase that holding by at least the ordered quantity, **When** the proposal is computed, **Then** `executed` is proposed.
2. **Given** a later increase smaller than the ordered quantity, **When** the proposal is computed, **Then** `partial` is proposed.
3. **Given** no matching change in any week since the order was issued, **When** the proposal is computed, **Then** the order stays `pending` (it is not proposed as `skipped` merely because time passed).
4. **Given** position changes are unknown or unavailable for a week, **When** the proposal is computed, **Then** no proposal is made for that week.
5. **Given** one position change could satisfy several pending orders for the same `SYMBOL` and `BROKER`, **When** proposals are computed, **Then** the change is not counted twice.

---

### Edge Cases

- An order is suggested, partly filled, and the remainder stays pending: age counts from the original issue week and the remaining quantity is what is escalated.
- A re-run replaces a week's unmarked orders: age is computed from the surviving stored orders, so a replaced order's age follows the replacement's week and is never inflated.
- The same `SYMBOL` is held at two brokers: orders and fills match on broker as well as symbol.
- An opposite-direction change (a sell when a buy is pending) must never satisfy the pending order.
- A week with a failed or empty analysis counts as a week for aging purposes only if it was a completed analysis; failed runs do not age orders.
- Dust or tiny-notional orders are aged and escalated by the same rules; a separate minimum-size rule is out of scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The weekly analysis input MUST include, for each order suggested in the preceding weeks that is still `pending`, its originating week, age in whole weeks, broker, symbol, side and recorded status.
- **FR-002**: The analysis MUST label any repeated suggestion of a previously suggested order as a carry-over and state its age in weeks.
- **FR-003**: An order that has been `pending` for more than 3 weeks MUST NOT be re-issued as a normal suggested order.
- **FR-004**: Each such stale order MUST appear in the analysis output as a distinct confirmation item asking the owner whether it was executed, skipped or is still wanted, showing its age.
- **FR-005**: Once an order's status is recorded as `executed`, `partial` or `skipped`, it MUST drop out of the pending and confirmation lists on the next analysis.
- **FR-006**: The 3-week staleness threshold MUST be a single named setting, not duplicated across prompt text and code.
- **FR-007**: The system MUST propose an execution status for a `pending` order by comparing it with position changes from every completed week since the order was issued, not only its own week. Proposals remain display-only; nothing is saved without owner confirmation.
- **FR-008**: Matching MUST use broker and symbol, require the direction of the change to match the order side, and MUST NOT count one position change toward more than one order.
- **FR-009**: The system MUST NOT propose `skipped` solely because time has passed with no matching change; absence of a fill leaves the order `pending`.
- **FR-010**: When position changes are unknown for a week, no proposal MUST be made from that week.
- **FR-011**: The first analysis after this feature ships MUST work with no prior orders or with prior orders lacking the information needed to age them, without error.
- **FR-012**: No real quantities, prices or holdings MUST be written to any tracked file, test fixture, log or commit as part of this feature; tests use placeholder data.

### Key Entities

- **Suggested order**: a recommendation from one weekly analysis; attributes include originating week, broker, symbol, side, quantity, conviction and recorded execution status.
- **Prior-order context**: the per-run summary of still-pending orders given to the analysis, with age in weeks and status.
- **Stale-order confirmation item**: an output entry for an order pending more than 3 weeks, asking the owner to resolve it.
- **Fill proposal**: a proposed execution status (`executed`, `partial`) for a pending order, derived from position changes and requiring owner confirmation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No order is issued as a normal suggestion for more than 3 consecutive weeks while its status stays `pending`; an order reaching the fourth week is escalated instead (0 silent repeats beyond week 3).
- **SC-002**: In a replay of the 8 observed weeks, every order repeated beyond week 3 is escalated to a confirmation item rather than re-issued.
- **SC-003**: For every pending order whose matching position change exists in a later completed week, a fill proposal is produced; in a replay of the observed weeks, no pending order with a verifiable matching change is left without a proposal.
- **SC-004**: The owner can resolve a stale order (executed, skipped or still wanted) in a single confirmation per order.
- **SC-005**: No regression for weeks with no prior orders: the analysis output for a first run is unchanged in structure.

## Assumptions

- "Age" is counted in completed weekly analyses since the order was first suggested, not calendar days, so irregular run cadence does not distort it.
- The 3-week threshold comes from the owner's request; it is a configurable value, with "more than 3 weeks" as the default.
- Recorded execution status is owner-reported; the existing propose-only rule stays: the system proposes, the owner confirms.
- Position-change data from earlier features is available for completed weeks; weeks where it is unknown are skipped for matching (FR-010).
- Out of scope: minimum notional rules for tiny orders, quantifying target-weight gaps, trigger-coherence rules, and any outcome P&L scoring (tracked separately in the roadmap and the suggestion-scorecard feature).
- Changes to the committed analysis prompt are code changes delivered through this feature's normal review, not edits to the owner's instructions document.
