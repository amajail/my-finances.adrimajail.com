# Research: Stale and Unrecorded Order Handling

No `NEEDS CLARIFICATION` items remained after the spec. The decisions below come from reading the current code.

## R1. Why the defect happens

- **Decision**: treat it as two separate gaps, not one prompt problem.
- **Findings**: `GenerateWeeklyAnalysis._loadPreviousAnalysis` loads exactly one prior analysis (`getLatest(5)`, first older date) and passes its orders with `executionStatus` but no age. The prompt only says "Do NOT silently repeat a prior unaddressed suggestion", which the model has ignored for 8 weeks. `OrderExecutionMatcher.propose` is called only in `getWeeklyAnalysis.js` (read path) and compares an order to the same week's position changes only.
- **Alternatives considered**: strengthening prompt wording alone. Rejected: it is the mechanism that already failed; a code-level filter is the guarantee, the prompt only helps the narrative.

## R2. Where aging and filtering happen

- **Decision**: a pure `PendingOrderTracker` domain service; the use case applies its result after the model returns.
- **Rationale**: pure and testable with placeholders; keeps the Function thin; the filter is deterministic so SC-001 ("0 silent repeats beyond week 3") does not depend on model behaviour.
- **Alternatives considered**: (a) have the model drop stale orders from prompt instructions only: not enforceable. (b) filter at read time in the Function: leaves stale rows persisted and counted by the scorecard.

## R3. Order identity across weeks

- **Decision**: an order's identity is `broker + symbol + side`. A chain is the run of consecutive completed analyses, walking back from the most recent prior one, in which an order with that key exists and is `pending`. The walk stops at the first week without such an order, or whose matching order has a non-pending status.
- **Rationale**: the re-issued order is a new row each week (new date, new index), so marking the original row never resolves its re-issues; chain identity by key is the only stable link. Quantity is deliberately not part of the key (the model may re-issue with a slightly different size).
- **Alternatives considered**: add a persistent `originOrderId`. Rejected for now: needs a schema change on every row and a backfill; the key-based walk reproduces the same answer from existing data.

## R4. How far back to look

- **Decision**: 8 completed analyses, with ages above 8 shown as 8.
- **Rationale**: the threshold is 3, so 4 is the minimum to detect staleness; 8 matches the observed history and bounds reads to 8 partition-key lookups.

## R5. Failed and empty weeks

- **Decision**: only `status: completed` analyses count as weeks; a failed run is skipped, not counted as a week.
- **Rationale**: matches the spec edge case (failed runs do not age orders). A completed week with `orders: []` breaks the chain, which is correct: the model chose not to suggest it.

## R6. Fill inference across weeks

- **Decision**: add `OrderExecutionMatcher.proposeAcrossWeeks(order, issuedDate, weeks)` where `weeks` is the completed analyses after `issuedDate` with their `positionChanges`. It sums matching same-direction deltas for the key, with a per-key remaining-delta ledger shared across orders in one call (greedy, oldest order first) so one change cannot satisfy two orders. Result: `executed` if the summed magnitude covers the quantity, `partial` if some, otherwise `null` (still pending). It never returns `skipped`.
- **Rationale**: matches FR-007 to FR-010. Weeks whose `positionChanges` is `null` are ignored.
- **Alternatives considered**: reuse single-week `propose` per week and OR the results: double counts and can mark `executed` from two half fills of unrelated orders.

## R7. What to do with a probable fill

- **Decision**: a chain whose cross-week proposal is `executed` or `partial` is treated like a stale one for generation: not re-issued as a normal order, listed as a confirmation item with reason `likely-filled`. Proposals are still never saved without owner confirmation.
- **Rationale**: re-issuing an order the portfolio already shows as filled is the observed bug. The positions already reflect it, so any needed top-up is driven by fresh drift. This extends FR-003; the spec gets one added requirement (FR-013).
- **Alternatives considered**: only escalate by age. Rejected: leaves up to 3 weeks of wrong re-issues for orders whose fill is visible.

## R8. Carry-over label

- **Decision**: store `ageWeeks` on each persisted order (0 = new, N = N prior weeks pending). The label is derived in code, not by the model.
- **Rationale**: the model cannot be relied on to label itself; storing the integer lets the dashboard and MCP show it without recomputation. Old rows have no value and read as 0.

## R9. Persisting confirmation items

- **Decision**: one JSON column `confirmationItemsJson` on the analysis row, `[]` when none.
- **Rationale**: consistent with how `positionChangesJson`, `macroChangesJson` and similar are stored; no new table or repository method.
- **Alternatives considered**: a new table of open items. Rejected as over-built for a single-user tool.

## R10. Prompt change

- **Decision**: add a `## pendingOrders` block to the user message built in `_buildUserMessage` and one short entry in `weekly-rebalance-v1.md` describing it. The threshold value comes from the exported constant, interpolated into the block, never typed into the prompt file.
- **Rationale**: FR-006 (single setting). This is a committed-prompt change, so it ships through this feature's PR, not the owner's instructions document.

## R11. Dashboard

- **Decision**: render `confirmationItems` as a small panel above the order list and show `ageWeeks` as a badge. Owners resolve items with the existing execution-status control; no new write path.
- **Rationale**: SC-004 (one confirmation per order) is met by the existing status action on the original or latest order row.
