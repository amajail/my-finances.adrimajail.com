# Feature Specification: Dashboard Metrics Trim

**Feature Branch**: `feature/003-dashboard-metrics-trim`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "Dashboard should display only three metrics per position in each broker table: value, P&L, and %. Remove the other metric columns from each broker's positions table on the home dashboard."

## Clarifications

### Session 2026-05-17

- Q: When you said "only columns: value, P&L, %", did you mean literally three cells per row, or three *metric* columns alongside the existing Symbol row identifier? → A: Keep Symbol column as row identifier; the three *metric* columns are Value, P&L, %. Table has 4 columns total (Symbol + 3 metrics).
- Q: When the dashboard hides Quantity / PPC / Last price, how should the portfolio owner still see those values when curious? → A: They are not available on the home dashboard at all. The portfolio owner navigates to the Positions page when they need quantity, PPC, or last price. No tooltip, popover, or expand-on-click is added to the home dashboard.
- Q: What is the default sort order when a broker's table first renders, before the user clicks any column header? → A: Sort by **Value descending** — biggest holdings on top. The user can still click any sortable column to override.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Glance at each holding's outcome (Priority: P1)

When the portfolio owner opens the home dashboard, each broker's positions table shows only the three numbers that matter to them at a glance: how much each holding is worth right now (value), how much money it has made or lost (P&L), and the gain/loss as a percentage (%). The symbol stays so they can tell which row is which holding.

**Why this priority**: This is the entire feature. Without trimming the columns there is no change to deliver.

**Independent Test**: Open the home page with at least one broker that has open positions. Confirm each broker's positions table shows columns: Symbol, Value, P&L, %. Confirm no other metric columns (Quantity, PPC / average cost, Last / current price) appear.

**Acceptance Scenarios**:

1. **Given** the portfolio owner has open positions across multiple brokers, **When** they load the home dashboard, **Then** every broker's positions table displays exactly four columns: Symbol, Value, P&L, %.
2. **Given** a broker's positions table has just rendered for the first time, **When** the portfolio owner has not yet clicked any column header, **Then** rows are ordered by Value descending so the largest holdings appear at the top.
3. **Given** a broker's positions table is showing trimmed columns, **When** the portfolio owner sorts the table, **Then** they can sort by any of the three metric columns (Value, P&L, %) and by Symbol; sort options for removed columns are gone.
4. **Given** the asset-type filter pills above a broker table, **When** the portfolio owner filters by a specific asset type, **Then** the table still displays only Symbol, Value, P&L, % for the filtered rows.

### Edge Cases

- A position with no current price available: the Value, P&L, and % cells show the same "not available" indicator the dashboard already uses, rather than a number.
- A position whose cost basis is zero (e.g., free / vested shares): the % column shows the existing "not available" indicator instead of a divide-by-zero or "∞".
- A broker with zero open positions: the table renders its empty-state message rather than an empty four-column grid.
- Mixed currencies inside one broker (USD and ARS holdings together): Value and P&L still display in each position's own currency on its own row — there is no implicit conversion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The per-broker positions table on the home dashboard MUST display only the following columns, in this order: Symbol, Value, P&L, %.
- **FR-002**: The system MUST remove the Quantity, PPC (average cost), and Last (current price) columns from each broker's positions table on the home dashboard. These values MUST NOT be exposed via tooltip, hover popover, expandable row, side panel, or any other secondary interaction on the home dashboard. The Positions page remains the place to view or edit them.
- **FR-003**: Sorting controls MUST remain available for the columns that are still displayed (Symbol, Value, P&L, %) and MUST be removed for any column that is no longer displayed.
- **FR-003a**: Each broker's table MUST default-sort by **Value descending** on first render. A user-initiated sort (clicking a column header) overrides the default for the duration of the page session.
- **FR-004**: The asset-type filter above each broker's table MUST continue to work and MUST keep filtering the same trimmed column set.
- **FR-005**: Per-row Value, P&L, and % MUST be computed and shown the same way they are shown today (same units, same currency handling per row, same "not available" placeholder when a value cannot be computed).
- **FR-006**: P&L and % cells MUST keep the existing visual cue that distinguishes a gain from a loss.
- **FR-007**: All dashboard elements outside the per-broker positions tables — the page-level grand total, the four summary stat cells, the per-broker summary cards, and the Top / Bottom performers panels — MUST remain unchanged by this feature.

### Key Entities *(include if feature involves data)*

- **Position row (in a broker table)**: Represents a single open holding inside one broker. After this change, the row exposes four user-visible fields: the identifying Symbol, plus three metrics — Value (current market value), P&L (unrealized gain or loss in money), and % (unrealized gain or loss as a percentage of cost basis). All other position attributes (quantity, average cost, current price, etc.) are still tracked in the underlying data but are no longer displayed in this table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the home dashboard, the count of distinct metric columns in every broker's positions table drops from 6 (Qty, PPC, Last, Value, P&L, %) to 3 (Value, P&L, %).
- **SC-002**: A portfolio owner can identify any holding's value, gain/loss, and gain/loss percentage in a single horizontal glance, without horizontal scrolling, on a standard laptop screen.
- **SC-003**: No information that is *currently* obtainable only from the Value, P&L, or % columns is lost — every value previously shown in those three columns remains visible after the change.
- **SC-004**: No element of the dashboard outside the per-broker positions tables changes appearance or behavior as a result of this feature (verified by direct visual comparison of the rest of the page against the previous state).

## Assumptions

- The Symbol column (with its asset-type tag) is treated as a row identifier rather than a "metric", and is therefore kept. Without it, rows in the trimmed table would be unreadable.
- This feature applies only to the per-broker positions tables on the home dashboard (the page rendered at `/`). The standalone Positions page and other pages (Brokers, Analysis, Settings) are out of scope.
- "Value", "P&L", and "%" refer to the same quantities the dashboard already shows today (current market value in the position's currency, unrealized profit-and-loss in that same currency, and that P&L expressed as a percentage of the position's cost basis). No new metric definitions are introduced.
- The underlying data model and APIs are unchanged. Quantity, average cost, and current price continue to exist on each position record and continue to be returned by the API; they are simply no longer rendered in this table.
- The existing currency convention is preserved: each row displays Value and P&L in that position's own currency; mixed-currency totals are not introduced into the per-broker table.
