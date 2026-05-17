# Phase 0 Research: Dashboard Metrics Trim

**Feature**: 003-dashboard-metrics-trim
**Date**: 2026-05-17

The spec is small and the change is contained to a single frontend file. No NEEDS CLARIFICATION markers survived `/speckit-clarify`. This document records the handful of design decisions that flow directly from the spec's clarifications and from reading the current implementation.

---

## Decision 1: Where the change lands

**Decision**: All edits land in `dashboard/src/lib/portfolio-page.js`. No other files are modified.

**Rationale**: The home page (`dashboard/src/pages/index.astro`) is a thin Astro shell. The per-broker positions tables — their `<thead>`, `<tbody>`, sort accessors, sort handlers, asset-type filter, and per-row state — are all built inside `portfolio-page.js`. Confirmed by reading the file end-to-end (308 lines). The table HTML is constructed by `brokerRowHtml` (rows) and an inline template literal (header) inside the `load()` function.

**Alternatives considered**:
- Extracting a `BrokerTable` component (Astro or vanilla). Rejected: the existing implementation is a single 300-line function and the trim is small. Refactoring for refactor's sake would inflate the PR and contradicts the "don't add abstractions beyond what the task requires" guideline.
- Adding a feature flag to toggle column sets. Rejected: this is a one-way UX decision; no need for a runtime switch.

---

## Decision 2: How "default sort by Value descending" is wired

**Decision**: Initialize the broker state with `sortKey: 'value'` and `sortDir: 'desc'` at the place where `brokerState.set(brokerId, { ... })` is called.

**Rationale**: The existing sort machinery already supports this. `sortRows()` honors any `(sortKey, sortDir)` pair, and `renderBrokerRows()` already renders the ▼/▲ indicator on the active header. The only line that needs to change is the state initializer (currently `sortKey: null`). No new code paths.

**Alternatives considered**:
- Sorting the input array up front and leaving `sortKey: null`. Rejected: the sort indicator (▼) on the Value header on first render only appears when `state.sortKey === 'value'`. Pre-sorting silently would lose that visual cue and confuse the user the moment they click another header.

---

## Decision 3: How removed columns are removed

**Decision**: Three coupled edits in `portfolio-page.js`:

1. **`SORT_ACCESSORS`** — delete the `quantity`, `averageCost`, and `price` entries. Keep `symbol`, `value`, `pnl`, `pct`.
2. **Header HTML** — remove the three `<th>` cells for `quantity`, `averageCost`, and `price` from the inline table template inside `load()`.
3. **Row HTML** — `brokerRowHtml()` returns only four `<td>` cells: Symbol, Value, P&L, %. The `price` value is no longer destructured into the row's cell set (the upstream `buildBrokerRows()` may still compute it — see Decision 4).
4. **Empty-state row** — the `<tr><td colspan="7">No matching positions.</td></tr>` `colspan` becomes `4`.

**Rationale**: Each edit is local. Coupling them in a single commit (or single task in tasks.md) keeps the diff coherent and prevents an interim broken state where the header and body disagree on column count.

**Alternatives considered**:
- Driving the column set from a config object. Rejected: over-engineered for a one-time trim with no foreseen need to add columns back.

---

## Decision 4: What stays computed even though it's not rendered

**Decision**: `buildBrokerRows()` continues to compute `price` (via `effectivePrice(p)`) because `mv` (market value) depends on it through `marketValue(p)`. The `price` field on each row object becomes effectively unused after the header/row edits — leaving it in place is harmless and avoids a deeper refactor of the row shape.

**Rationale**: `marketValue()` already calls `effectivePrice()` internally; nothing changes there. The `price` field on the row object is currently consumed only by `brokerRowHtml()` (deleted) and `SORT_ACCESSORS.price` (deleted). It is therefore unused after the edits.

**Decision sub-point**: Do we strip the unused `price` field from row objects?

- Default: **keep it**. The field is cheap, scoped to the in-memory row record, and removing it adds noise to the diff without simplifying anything callers can see. Aligns with "don't refactor surroundings" guidance.
- If a reviewer prefers tightness: dropping it is a one-line edit in `buildBrokerRows()`. We can either path; the tasks file will note this as optional cleanup.

---

## Decision 5: Currency display, decimals, color cue — all preserved verbatim

**Decision**: The Value cell continues to render as `${mv.toFixed(0)} ${p.currency}` (integer + space + currency code). The P&L cell continues to render as `${pnl.toFixed(0)}` (integer, no currency suffix). The % cell continues to use `fmtPct(pct)` from `format.js` (signed, two decimals, with `+` for positive). The gain/loss class continues to come from `pnlClass()`.

**Rationale**: FR-005 of the spec pins this to "shown the same way as today". The existing helpers in `format.js` (`fmtPct`, `pnlClass`) handle the cases (null, zero, gain, loss). No new helpers needed.

**Alternatives considered**:
- Adding decimals to Value/P&L for the trimmed table. Rejected: out of scope (the user trimmed columns, didn't ask to change precision); would also widen the cell and undermine the "horizontal glance" success criterion (SC-002).
- Stripping the currency suffix from Value. Rejected: a single broker can hold both USD and ARS positions on the same table; the suffix is the disambiguator.

---

## Decision 6: Edge-case rendering uses existing fallbacks

**Decision**: All three "not available" cases (no current price → null `mv`/`pnl`; zero cost basis → null `pct`; empty broker → empty table body) reuse the dashboard's existing fallback paths. No new edge-case code is added.

**Rationale**: The current row template already emits `'—'` (em dash) for null `mv`/`pnl`; `fmtPct()` already returns `'—'` for null pct; the empty-state `<tr>` is already in place. These all keep working — the only adjustment is the empty-state `colspan`.

**Alternatives considered**: None. Existing fallbacks already match the spec's edge-case list.

---

## Decision 7: No tests added

**Decision**: No automated tests in this feature.

**Rationale**: Constitution Principle IV (Pragmatic Testing) exempts frontend visual UI unless it encodes business rules. The trimmed table delegates all computation to `pricing.js` (untested-by-design, since it is thin arithmetic over the position record) and `format.js` (pure formatting). The change touches rendering and state initialization — areas the project intentionally does not test. Verification is via `quickstart.md`.

**Alternatives considered**:
- Snapshot test on rendered HTML. Rejected: the project has no snapshot infrastructure; introducing one here would violate the "don't add abstractions beyond what the task requires" guideline. Visual diff at quickstart time is more valuable.

---

## Open items deferred to implementation time

- Whether to also delete the unused `price` field from row objects (cleanup; see Decision 4). The plan and tasks file will leave this as optional.
- Mobile / narrow-viewport behavior of the now-4-column table. Out of scope for this feature; the table inherits the dashboard's existing responsive behavior unchanged.
