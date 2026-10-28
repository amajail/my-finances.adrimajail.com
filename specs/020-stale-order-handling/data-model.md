# Data Model: Stale and Unrecorded Order Handling

All examples use placeholders. No new Azure table.

## SuggestedOrder (existing, one optional field added)

| Field | Type | Notes |
|---|---|---|
| `ageWeeks` | integer >= 0, default 0 | NEW. Prior consecutive completed weeks this broker+symbol+side order was already pending when issued. 0 means new. Capped at 8. Old rows read as 0. |

Validation: `ageWeeks` must be an integer between 0 and 8 inclusive; invalid values fail entity construction like other fields. Stored in `portfolioOrders` as a plain number column.

## PendingOrderChain (derived, not stored)

Computed by `PendingOrderTracker` for the target date from the last 8 completed analyses before it.

| Field | Type | Notes |
|---|---|---|
| `key` | string | `${broker}|${symbol}|${side}` |
| `broker`, `symbol`, `side` | string | as on the order |
| `originDate` | ISO date | earliest week in the chain |
| `lastDate` | ISO date | most recent prior week in the chain |
| `ageWeeks` | integer 1..8 | number of consecutive pending weeks |
| `lastQuantity` | number | quantity in the most recent instance |
| `proposedStatus` | `executed` \| `partial` \| null | cross-week fill proposal (never `skipped`) |
| `reason` | `fresh` \| `stale` \| `likely-filled` | `stale` when `ageWeeks > STALE_AFTER_WEEKS`; `likely-filled` when `proposedStatus` is set; `fresh` otherwise |

State: a chain is created by the first pending instance, grows by one per consecutive week, and ends when a week has no matching order, or the matching order is marked `executed`, `partial` or `skipped`.

## ConfirmationItem (stored on the analysis row)

| Field | Type | Notes |
|---|---|---|
| `broker`, `symbol`, `side` | string | identity of the chain |
| `quantity` | number | quantity in the most recent instance |
| `ageWeeks` | integer | |
| `originDate` | ISO date | |
| `reason` | `stale` \| `likely-filled` | |
| `proposedStatus` | `executed` \| `partial` \| null | present for `likely-filled` |

Stored as `confirmationItemsJson` (array, `[]` when none) on `portfolioAnalysis`; absent on old rows and read as `[]`. Items are replaced on every re-run of the date (derived data, not owner input).

## Constants

`STALE_AFTER_WEEKS = 3` exported from `PendingOrderTracker`; an order is stale when `ageWeeks > STALE_AFTER_WEEKS`. `MAX_LOOKBACK_WEEKS = 8`.

## Relationships

- WeeklyAnalysis 1 to many SuggestedOrder (unchanged).
- WeeklyAnalysis 1 to many ConfirmationItem (embedded JSON).
- A chain links SuggestedOrder rows across WeeklyAnalysis dates by key, with no stored foreign key.
