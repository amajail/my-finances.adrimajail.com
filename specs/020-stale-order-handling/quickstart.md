# Quickstart: validating stale order handling

All data below is placeholder (`SYMBOL`, `BROKER`). Never use real holdings in tests, fixtures or commits.

## Prerequisites

- `npm install`; Azurite not required for unit tests.
- Branch `020-stale-order-handling`.

## 1. Unit tests

```bash
npx jest tests/unit/domain/services/PendingOrderTracker.test.js \
         tests/unit/domain/services/OrderExecutionMatcher.test.js \
         tests/unit/application/use-cases/analysis
```

Expected: all pass. They cover, with placeholder data:

- Aging: a pending order in 4 consecutive completed weeks has `ageWeeks = 4` and reason `stale`; exactly 3 is `fresh`.
- Chain breaks: a week with no matching order, a non-pending status, or an opposite-side order ends the chain; failed analyses are skipped, not counted.
- Cross-week fill: a later increase covering the quantity proposes `executed`, a smaller one `partial`, none leaves `null` (never `skipped`); weeks with unknown changes are ignored.
- No double count: two pending orders for the same broker+symbol+side share one change.
- Generate flow: stale and likely-filled orders are removed from the saved `orders` and appear in `confirmationItems`; younger repeats are stamped with `ageWeeks`; a first run with no prior orders is unchanged.
- Re-run idempotence: running the same date twice yields identical orders and items.

## 2. Replay scenario (SC-002)

In the generate-flow test, seed 8 prior completed analyses each with one pending buy for `SYMBOL` at `BROKER`, then stub the model to repeat it. Expect the new analysis to contain no normal order for that key and one confirmation item with `ageWeeks = 8` and reason `stale`.

## 3. Read path

```bash
npx jest tests/unit/functions/getWeeklyAnalysis.test.js
```

Expect `ageWeeks` on each order, `confirmationItems` on the analysis, and `proposedStatus` computed across later weeks.

## 4. Manual check against local Functions (optional)

1. `npm start` and `curl http://localhost:7071/api/analysis/weekly/<date>` for a seeded date; confirm the two new fields are present.
2. Record an order via the existing execution-status route; regenerate the next week and confirm the item disappears.

Do not run a generation against the production store from a test setup, and do not commit any output of real runs.
