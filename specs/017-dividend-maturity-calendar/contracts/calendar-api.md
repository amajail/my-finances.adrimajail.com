# Contract: GET /api/calendar

**Feature**: 017-dividend-maturity-calendar · **Auth**: `authLevel: 'function'` (repo-standard local bypass applies) · **Method**: GET only.

## Request

| Query param | Type | Default | Constraints |
|---|---|---|---|
| `days` | integer | 180 | 1 ≤ days ≤ 400; non-numeric/out-of-range → 400 |

## Responses

### 200 OK

Body: see `data-model.md` "API response". Guarantees:

- `events` sorted ascending by `date`, overdue maturities first.
- Every open fixed-income position (bond/bopreal/lecap/on/deposit) with a valid `maturityDate` inside the horizon appears exactly once as `type: "maturity"` (SC-001).
- `dividendSourceAvailable: false` ⇒ zero dividend events present AND the flag is the page's cue for the degraded notice (FR-007); maturity events unaffected.
- Amounts: `amountNative`/`amountUsd` nullable, never fabricated; `estimated` always `true`.
- `months[].totalUsd` = sum of that month's non-null `amountUsd`; `excludedFromTotal` counts the null ones (FR-010).

### 400 Bad Request

`{ "error": { "message": "days must be an integer between 1 and 400" } }` (shape via `_shared.js` `fail`).

### 500

Only for store-read failures (positions unreachable). Dividend-source failure is NEVER a 500 (FR-007).

## Non-goals

No POST/PUT/DELETE. No pagination (event counts are tens, not thousands). No per-broker filter in v1.

## Smoke-test expectations (tests/unit/functions/calendar.test.js)

1. 200 with events + months arrays for a store containing maturity-dated positions (fake data).
2. `days=0` → 400.
3. Provider throwing → 200 with `dividendSourceAvailable: false` and maturities intact.
