# Tasks: Dividend & Maturity Calendar

**Input**: Design documents from `/specs/017-dividend-maturity-calendar/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D6), data-model.md, contracts/calendar-api.md

**Tests**: included per constitution Principle IV — domain service, use case, provider, and function smoke tests are where bugs hurt (silent miscalculation of amounts/dates). Astro page is exempt (build + 360px check instead).

**Organization**: Foundational compute layer first (all stories depend on it), then one phase per user story in priority order.

## Phase 1: Setup

- [ ] T001 Create `src/application/use-cases/calendar/` directory and confirm baseline green (`npm test`, `npx eslint .`) on branch `017-dividend-maturity-calendar`

---

## Phase 2: Foundational (blocking all user stories)

**Purpose**: the event-computation core — provider, builder, use case, wiring.

- [ ] T002 [P] Define `IDividendEventsProvider` in `src/application/interfaces/IDividendEventsProvider.js` — `getUpcomingDividends(symbols)` → `{ facts, failedSymbols, sourceAvailable }`, never rejects (data-model.md "DividendFacts")
- [ ] T003 [P] Implement `CalendarEventBuilder` in `src/domain/services/CalendarEventBuilder.js` — pure static: (openPositions, dividendFacts, horizonDays, today) → sorted `CalendarEvent[]`; maturity derivation for bond/bopreal/lecap/on/deposit with parseable `maturityDate`; overdue flag (FR-009); native amount via `faceValue/100` convention; USD via the position's existing `valueUsd` (research D3); CEDEAR dividend events date-only (D2); count `fixedIncomeWithoutMaturity`
- [ ] T004 [P] Unit tests in `tests/unit/domain/services/CalendarEventBuilder.test.js` — maturity in/out of horizon, overdue-first ordering, unparseable date counted not thrown, cedear date-only, null-amount events kept (FR-008), fake data only
- [ ] T005 Implement `YahooDividendEventsProvider` in `src/infrastructure/providers/YahooDividendEventsProvider.js` — injected client, `quoteSummary(symbol, {modules:['calendarEvents','summaryDetail']})` per research D1, per-symbol ~3s timebox, parallel, per-symbol failure → `failedSymbols`, total failure → `sourceAvailable:false`; export from `src/infrastructure/providers/index.js`
- [ ] T006 [P] Unit tests in `tests/unit/infrastructure/providers/YahooDividendEventsProvider.test.js` — mocked client: dates+rate mapping, missing rate → null estimate, one-symbol failure isolation, all-fail → sourceAvailable false, never rejects
- [ ] T007 Implement `GetCalendarEvents` in `src/application/use-cases/calendar/GetCalendarEvents.js` — deps: getPortfolioSummary, dividendEventsProvider (optional); input `{days}` (default 180, clamp 1–400); open positions → builder; response shape per data-model.md (without `months` — added in US3)
- [ ] T008 [P] Unit tests in `tests/unit/application/use-cases/calendar/GetCalendarEvents.test.js` — horizon filtering, provider-absent still returns maturities, `dividendSourceAvailable` propagation, days clamping
- [ ] T009 Wire provider + use case in `src/application/di/container.js` (follow the existing `getGetPortfolioSummary` singleton pattern)

**Checkpoint**: `npm test` green — compute core complete, no HTTP/UI yet.

---

## Phase 3: User Story 1 — consolidated event view (P1) 🎯 MVP

**Goal**: calendar page shows all maturities + dividends grouped by month, mobile-safe.

**Independent test**: with maturity-dated open positions in the store, `/calendar` lists each under the right month with date/days-until/estimated amount; a dividend-paying US holding shows its dates; 360px viewport has zero horizontal scroll.

- [ ] T010 [US1] Implement `GET /api/calendar` in `src/functions/calendar.js` — thin: parse `days`, 400 on invalid (contract), use-case, `ok/mapError` from `src/functions/_shared.js`, `authLevel: 'function'`
- [ ] T011 [US1] Register the function in `src/functions/index.js`
- [ ] T012 [P] [US1] Smoke tests in `tests/unit/functions/calendar.test.js` — the 3 cases from contracts/calendar-api.md (200 shape, days=0 → 400, provider-throw → 200 degraded)
- [ ] T013 [US1] Create `dashboard/src/pages/calendar.astro` — client fetch via `dashboard/src/lib/api.js` + `dashboard/src/lib/load.js`; month-grouped stacked cards (no wide table); overdue section pinned first with distinct styling (FR-009); degraded-dividends notice from `dividendSourceAvailable` (FR-007); `fixedIncomeWithoutMaturity` note; escape all strings via `lib/format.js` `escapeHtml`
- [ ] T014 [US1] Add Calendar nav link in `dashboard/src/layouts/Layout.astro` — verify the 10-link desktop row still fits at 1024px; hamburger handles below `lg`
- [ ] T015 [US1] Verify FR-004/SC-004: `cd dashboard && npx eslint . && npm run build` (placeholder env vars) + Playwright 360×800 check `document.documentElement.scrollWidth <= 360` on /calendar

**Checkpoint**: MVP shippable — calendar visible and mobile-safe.

---

## Phase 4: User Story 2 — weekly analysis anticipates events (P2)

**Goal**: `## upcomingEvents` block (28-day window) in the analysis prompt, omitted when empty.

**Independent test**: unit-level — prompt contains the block iff ≥1 event in window; a throwing calendar dep never fails the run.

- [ ] T016 [US2] Add optional `getCalendarEvents` constructor dep (default null) to `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`; in `execute`, fetch 28-day window inside try/catch (failure → null, warn-log without payload); in `_buildUserMessage`, append `## upcomingEvents` with trimmed fields `{type,date,daysUntil,symbol,broker,amountUsd}` only when non-empty (FR-005; mirror the concentrationCaps block style)
- [ ] T017 [US2] Pass the calendar use case to GenerateWeeklyAnalysis in `src/application/di/container.js`
- [ ] T018 [P] [US2] Unit tests in `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.upcomingEvents.test.js` — block present with event in window, absent when empty, absent + run succeeds when dep throws, absent when dep null (all existing tests must pass unchanged — optional-dep pattern)

**Checkpoint**: next weekly run sees upcoming maturities.

---

## Phase 5: User Story 3 — monthly income outlook (P3)

**Goal**: month headers show estimated USD totals with excluded-count note.

**Independent test**: month header total = sum of that month's non-null `amountUsd`; excluded count matches null-amount events.

- [ ] T019 [US3] Add `months[]` computation (`{month,totalUsd,excludedFromTotal,eventCount}`) to `src/application/use-cases/calendar/GetCalendarEvents.js` per FR-010 + extend `tests/unit/application/use-cases/calendar/GetCalendarEvents.test.js` (subtotal math, exclusion count)
- [ ] T020 [US3] Render month-header totals + "N without estimate" note in `dashboard/src/pages/calendar.astro`

---

## Phase 6: Polish & cross-cutting

- [ ] T021 Full gates: `npm test`, `npm run test:coverage` (floors 65/58/59/65 must hold), `npx eslint .` (root + dashboard), dashboard build — all green
- [ ] T022 Owner verification per `specs/017-dividend-maturity-calendar/quickstart.md` (local `func start` probe against real data; NEVER commit output/screenshots — privacy)

---

## Dependencies

- Phase 2 blocks everything; within it: T002+T003 [P] first; T005 after T002; T007 after T003+T005; T009 after T007.
- US1 (T010–T015) needs Phase 2. US2 (T016–T018) needs Phase 2 only — independent of US1. US3 (T019–T020) needs Phase 2 + T013 (page exists).
- Story order US1 → US2 → US3 is priority order, but US2 can run in parallel with US1 (disjoint files).

## Parallel example (Phase 2)

```text
Batch A: T002, T003 (+T004 as T003 lands)
Batch B: T005 (+T006), then T007 (+T008), then T009
```

## Implementation strategy

MVP = Phase 1 + 2 + US1 (T001–T015): a working, mobile-safe calendar page. US2 is a small, high-leverage add (one use-case touch + tests). US3 is cosmetic aggregation. Commit per task-group with `feat(017):`/`docs(017):` conventional messages; scan every diff for real-data leakage before staging (constitution I — all fixtures fake).
