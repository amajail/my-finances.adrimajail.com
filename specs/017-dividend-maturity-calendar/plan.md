# Implementation Plan: Dividend & Maturity Calendar

**Branch**: `017-dividend-maturity-calendar` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-dividend-maturity-calendar/spec.md`

## Summary

Consolidated forward-looking calendar of cash-relevant events: maturity events derived server-side from open positions' existing `maturityDate` (bond/bopreal/lecap/on/deposit), plus declared dividend events for US-listed holdings fetched via the already-present `yahoo-finance2` dependency. One new read-only use case (`GetCalendarEvents`) exposed three ways: `GET /api/calendar`, a new `calendar.astro` dashboard page (month-grouped, feature-016 mobile patterns), and a compact `## upcomingEvents` block in the weekly-analysis prompt (4-week window, omitted when empty — same conditional-block pattern as features 013/014 and the concentrationCaps block).

## Technical Context

**Language/Version**: Node.js 22 (Azure Functions v4 backend), Astro 6 dashboard (static, client-side fetch)

**Primary Dependencies**: `yahoo-finance2` (existing — used by `YahooFinancePriceProvider`), `@azure/data-tables` (existing). **No new runtime dependencies.**

**Storage**: none added. Reads `portfolioPositions` via existing `IPositionRepository`/`GetPortfolioSummary` path. No caching table in v1 (decision D4 in research.md).

**Testing**: Jest 30 unit tests (domain service + use case + provider with mocked client), function smoke test. Dashboard page follows the repo's no-frontend-tests convention (Principle IV) — verified via build + manual/Playwright check.

**Target Platform**: Azure Functions (Linux) + Azure Static Web Apps

**Project Type**: web-service + static frontend (existing structure; no new projects)

**Performance Goals**: calendar responds < 5 s with ~20 dividend lookups (parallel, individually timeboxed); page usable in < 10 s per SC-002

**Constraints**: dividend-source failure must degrade, never break maturities (FR-007); zero horizontal scroll at 360 px (FR-004/SC-004); weekly-analysis block adds ≤ ~300 tokens and is omitted when empty (FR-005, token-diet lineage)

**Scale/Scope**: ~45 open positions, ~20 dividend-eligible symbols; single user

## Constitution Check

*GATE: evaluated against constitution v1.1.1 — PASS (pre-Phase-0 and re-checked post-Phase-1).*

- **I. Privacy First**: PASS. All artifacts use placeholder symbols/amounts. Dividend lookups send only ticker symbols to Yahoo (already the case for prices — same egress surface as `RefreshPrices`; no quantities or cost data leave). No new log sinks; event amounts are never logged.
- **II. Clean Architecture**: PASS. Logic in `GetCalendarEvents` use case + `CalendarEventBuilder` domain service; `IDividendEventsProvider` interface in `src/application/interfaces/`, Yahoo implementation in `src/infrastructure/providers/`; `src/functions/calendar.js` stays thin (parse → use-case → respond via `_shared.js`).
- **III. Idempotent Data Operations**: PASS trivially — feature is read-only; no writes anywhere (FR-006).
- **IV. Pragmatic Testing**: PASS. Tests where bugs hurt: event derivation (dates, USD estimates, overdue flag), degradation path, prompt-block omission. Astro page exempt per constitution.
- **V. Convention-Driven Workflow**: PASS. Branch `017-dividend-maturity-calendar` matches spec dir; SDD pipeline followed.
- **New dependencies**: none — Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/017-dividend-maturity-calendar/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D6
├── data-model.md        # Phase 1 — CalendarEvent, horizons, API shape
├── quickstart.md        # Phase 1 — how to run/verify locally
├── contracts/
│   └── calendar-api.md  # GET /api/calendar contract
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── domain/services/
│   └── CalendarEventBuilder.js          # NEW — pure: positions (+dividend facts) → CalendarEvent[]
├── application/
│   ├── interfaces/IDividendEventsProvider.js   # NEW — getUpcomingDividends(symbols) contract
│   └── use-cases/calendar/GetCalendarEvents.js # NEW — orchestrates: summary → builder → sort/window
├── infrastructure/providers/
│   └── YahooDividendEventsProvider.js   # NEW — quoteSummary(calendarEvents,summaryDetail), timeboxed
├── functions/
│   ├── calendar.js                      # NEW — GET /api/calendar (authLevel per existing pattern)
│   └── index.js                         # MODIFIED — register calendar
└── application/use-cases/analysis/
    └── GenerateWeeklyAnalysis.js        # MODIFIED — optional dep + `## upcomingEvents` block

src/application/di/container.js          # MODIFIED — wire provider + use case
dashboard/src/pages/calendar.astro       # NEW — month-grouped list, .table-stack/cards at <sm
dashboard/src/layouts/Layout.astro       # MODIFIED — nav link (hamburger absorbs it below lg)

tests/unit/domain/services/CalendarEventBuilder.test.js        # NEW
tests/unit/application/use-cases/calendar/GetCalendarEvents.test.js  # NEW
tests/unit/infrastructure/providers/YahooDividendEventsProvider.test.js  # NEW
tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.upcomingEvents.test.js  # NEW
tests/unit/functions/calendar.test.js    # NEW — route smoke
```

**Structure Decision**: existing single-repo layout; one new use-case folder (`calendar/`), one new domain service, one new provider + interface — mirrors how features 006–014 slotted in. The weekly-analysis integration copies the `allocationTargetsRepository` precedent exactly: optional constructor dep, failure → block omitted, never fatal.

## Complexity Tracking

No constitution violations; no new dependencies. Section intentionally empty.
