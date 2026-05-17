---
description: "Task list for Dashboard Metrics Trim"
---

# Tasks: Dashboard Metrics Trim

**Input**: Design documents from `specs/003-dashboard-metrics-trim/`

**Prerequisites**: `plan.md` ✓, `spec.md` ✓, `research.md` ✓, `data-model.md` ✓, `quickstart.md` ✓. No `contracts/` (this feature exposes no new external interface).

**Tests**: Not generated. Per Constitution Principle IV (Pragmatic Testing) and `research.md` Decision 7, this UI-only feature is exempt from automated tests. Verification is via `quickstart.md`.

**Organization**: This feature has a single user story (US1, P1) which is also the MVP and the entire deliverable. All implementation tasks belong to US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies). _None of the tasks below are parallel — every implementation task edits the same single file (`dashboard/src/lib/portfolio-page.js`)._
- **[Story]**: Maps task to user story (US1 only in this feature).
- Exact file path always included in task description.

## Path Conventions

This feature is web-app frontend-only. All edits land in `dashboard/src/lib/portfolio-page.js`. No backend (`src/...`) paths are touched.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization.

**No tasks in this phase.** The existing dashboard dev environment (`dashboard/`), the running Azure Functions backend, and the Azurite-backed `portfolioPositions` table are already in place from previous features. No new dependencies are introduced.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting groundwork that must complete before user-story work begins.

**No tasks in this phase.** The data this feature renders (`Value`, `P&L`, `%`) is already produced by `buildBrokerRows()` via `marketValue()`, `costBasis()`, and arithmetic in `dashboard/src/lib/portfolio-page.js`. The existing sort engine (`sortRows()` + `SORT_ACCESSORS`), filter state, and gain/loss color cue (`pnlClass()` in `format.js`) are all reused as-is.

---

## Phase 3: User Story 1 — Glance at each holding's outcome (Priority: P1) 🎯 MVP

**Goal**: Each broker's positions table on the home dashboard shows only **Symbol, Value, P&L, %** (in that order) and default-sorts by Value descending on first render. Quantity, PPC, and Last price are completely removed from this view with no in-page fallback (no tooltip, popover, expand, or side panel).

**Independent Test**: Open the home dashboard locally with at least one broker holding multiple open positions. Visually confirm each broker's table has exactly four column headers in the order `Symbol | Value | P&L | %`, that no Quantity/PPC/Last columns or sort handles exist anywhere on the table, and that the topmost row's Value cell is the largest in the column on first render. Click each remaining header to confirm sort flips work; click the asset-type filter pills to confirm filtering still narrows the rows while keeping the four-column shape. (Maps to spec Acceptance Scenarios 1–4.)

### Implementation for User Story 1

- [ ] T001 [US1] Trim the per-broker table's column set in `dashboard/src/lib/portfolio-page.js` so the rendered table has exactly four columns — Symbol, Value, P&L, % — by making all four coupled edits in this single task:
  - Remove the `quantity`, `averageCost`, and `price` keys from `SORT_ACCESSORS` (keep `symbol`, `value`, `pnl`, `pct`).
  - In the inline `<table>` template inside `load()`, delete the three `<th>` cells whose `data-sort-key` is `quantity`, `averageCost`, and `price`. Keep the four `<th>` cells for `symbol`, `value`, `pnl`, `pct` in that order.
  - Rewrite `brokerRowHtml({ p, price, mv, pnl, pct })` to return a `<tr>` with exactly four `<td>` cells in this order: Symbol (with the existing `assetType` tag), Value (`${mv.toFixed(0)} ${p.currency}` when non-null, else `'—'`), P&L (`${pnl.toFixed(0)}` when non-null else `'—'`, with `pnlClass(pnl)`), % (`fmtPct(pct)` with `pnlClass(pct)`). All formatting and the gain/loss color cue stay identical to today (FR-005, FR-006).
  - Change the empty-state row's `colspan` from `7` to `4` (the `<tr><td colspan="7">No matching positions.</td></tr>` literal inside `renderBrokerRows()`).
  - **Do not modify** `attachAssetFilters()`, `renderBrokerRows()`'s asset-filter `filtered = …` block, or the `<div data-broker-filter="…">` pill markup. These implement FR-004 (asset-type filter must keep working) by remaining untouched; an unrelated cleanup here would silently break that requirement, which has no other edit task guarding it.

  After this task: every broker's positions table on the home page renders four columns and produces no JS errors. Sort still works on the four remaining columns. The asset-type filter still works. Default sort order is whatever the API returned (T002 will fix that).

- [ ] T002 [US1] Set the per-broker default sort to **Value descending** on first render in `dashboard/src/lib/portfolio-page.js`. In the loop that initializes per-broker state via `brokerState.set(brokerId, { rows: buildBrokerRows(brokerPositions), sortKey: null, sortDir: 'asc', activeAsset: 'all' })`, change `sortKey: null` to `sortKey: 'value'` and `sortDir: 'asc'` to `sortDir: 'desc'`. Leave `activeAsset: 'all'` unchanged. The existing `renderBrokerRows()` already emits the `▼` sort indicator on the Value header when `state.sortKey === 'value'` and `state.sortDir === 'desc'`, so no template change is needed. (FR-003a, AC-2.)

**Checkpoint (end of Phase 3)**: User Story 1 is fully delivered. Visit `/` locally; every broker's table has four columns, biggest holding on top, sort and filter both functional. No automated tests run — verification is the manual check in T004 below.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Optional cleanups and the manual verification check.

- [ ] T003 Optional cleanup in `dashboard/src/lib/portfolio-page.js`: drop the now-unused `price` field from the row object literal returned by `buildBrokerRows()` (it is no longer read by `brokerRowHtml()` after T001, nor by any remaining `SORT_ACCESSORS` entry — `marketValue()` continues to call `effectivePrice()` internally, so dropping the field is safe). Pure dead-code removal; the diff is one line. Skip this task if you'd rather keep the row shape stable for future use.

- [ ] T004 Run the manual smoke check in `specs/003-dashboard-metrics-trim/quickstart.md` end to end (steps 1–7). Confirm all four acceptance scenarios in `specs/003-dashboard-metrics-trim/spec.md` pass and that the unchanged page elements listed in FR-007 / SC-004 are visually identical to pre-feature state.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Empty — nothing to wait on.
- **Phase 2 (Foundational)**: Empty — nothing to wait on.
- **Phase 3 (US1)**: Can start immediately. Phases 1 and 2 are empty.
- **Phase 4 (Polish)**: Depends on Phase 3 completion.

### User Story Dependencies

There is only **US1**. No inter-story dependencies exist.

### Within User Story 1

- T001 and T002 both edit `dashboard/src/lib/portfolio-page.js`. They are logically independent (T001 touches the row/header/accessor/empty-state regions; T002 touches the state-initializer region) but they edit the same file, so they MUST be sequenced rather than parallelized. Execution order: T001 → T002.

### Phase 4

- T003 depends on T001 (the `price` field only becomes truly unused after T001's `brokerRowHtml` and `SORT_ACCESSORS` edits).
- T004 depends on T001 **and** T002 (the smoke check verifies both behaviors).
- T003 and T004 are independent of each other; execute them in either order or interleave.

### Parallel Opportunities

**None within this feature.** All implementation tasks touch the same file, so the [P] marker doesn't apply. The only marginally parallelizable pair is T003 ↔ T004 (different concerns, no file conflict between an edit and a manual check), but the practical benefit is negligible.

---

## Parallel Example: User Story 1

Not applicable to this feature — all US1 tasks edit a single file and must run sequentially. The placeholder below is kept only for template consistency.

```bash
# (No parallel batch — execute T001 then T002 sequentially.)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

User Story 1 **is** the MVP and **is** the feature. Once T001 and T002 are committed and T004's smoke check passes, the feature is done.

1. Complete T001 → commit (`feat(dashboard): trim broker tables to value/p&l/%`).
2. Complete T002 → commit (`feat(dashboard): default-sort broker tables by value desc`).
3. Optionally complete T003 → commit (`refactor(dashboard): drop unused price field from broker row shape`).
4. Run T004 (quickstart smoke check). If anything fails, fix it before opening the PR.
5. Open PR against `main`.

### Incremental Delivery

Each of T001 and T002 is independently visible to the user:

- After T001 alone: the table has four columns; rows render in API order.
- After T002 alone (without T001): biggest position would float to the top in the 7-column table — partly meaningful, but not the intended UX.
- After T001 + T002: the intended UX is delivered.

Either order works in principle (T002 → T001 is also valid), but committing T001 first matches the spec's primary requirement (column trim) and keeps the per-commit diff narratives clean.

### Parallel Team Strategy

Not applicable — single-developer feature, single file, two coupled edits.

---

## Notes

- **No [P] tasks** in this feature because every implementation task edits the same file.
- **No test tasks** — UI-only change, constitution-exempt.
- **No `contracts/` mapping** — no external interfaces touched.
- Commit cadence: per task is fine; bundling T001 + T002 into one commit is also fine — they're closely related and small. Follow the project's `feat:` / `refactor:` prefix convention (Constitution V).
- Privacy First (Constitution I): None of these edits introduce real holdings data into source — the file deals in field names and rendering logic only. The standard pre-commit diff scan still applies before staging.
