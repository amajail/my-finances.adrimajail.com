# Implementation Plan: Daily Automatic Price Refresh

**Branch**: `feature/daily-prices-workflow` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-daily-prices-refresh/spec.md`

## Summary

Shift the existing daily price-refresh timer from its current UTC-anchored schedule (`0 0 2 * * *`) to fire ~30 minutes after the NYSE close on US trading weekdays, DST-aware via the Function App's local-time setting. Remove the manual "Refresh prices" button and its handler from the dashboard while keeping the "Last refresh" timestamp. Retain the existing HTTP refresh endpoint as an authenticated operator escape hatch. No new services, no new dependencies, no schema changes.

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4 runtime); Astro for the dashboard.

**Primary Dependencies**: `@azure/functions ^4.5`, `@azure/data-tables ^13.3`, `yahoo-finance2 ^3.14`, `winston`, `dotenv`. No additions.

**Storage**: Azure Table Storage (`portfolioPositions`, `portfolioPrices`, `portfolioSettings`). No schema changes — only `currentPrice` and `currentPriceUpdatedAt` columns on Position rows continue to be updated by the existing `RefreshPrices` use case.

**Testing**: Jest (`npm test` → currently `jest --passWithNoTests`). One unit test added for the cron-expression / timezone change is sufficient; the use case itself is unchanged.

**Target Platform**: Azure Functions (Consumption plan, Linux or Windows — see Phase 0 research below). Astro static site deployed to Azure Static Web Apps.

**Project Type**: Web application (Azure Functions backend + Astro frontend).

**Performance Goals**: Refresh ≤ 1 minute end-to-end for current scale (<100 positions). Already met by the existing use case.

**Constraints**: Must remain DST-aware so the run lands at the same wall-clock time relative to the NYSE close year-round. Must not regress the privacy posture (no real holdings committed in tests/fixtures/scripts).

**Scale/Scope**: One portfolio owner, ~10s of open positions, < 1 refresh run per US trading day. Negligible cost on Consumption plan.

## Constitution Check

*Gate evaluated against `.specify/memory/constitution.md` v1.0.0.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Privacy First (NON-NEGOTIABLE) | ✅ | All changes are code/config; no real holdings touched. Test fixtures, if added, will use placeholder symbols/amounts. |
| II. Clean Architecture / DDD | ✅ | Change is confined to the timer entry point (`src/functions/refreshPricesTimer.js`) and frontend UI files. `RefreshPrices` use case is **not** modified. |
| III. Idempotent Data Operations | ✅ | Existing `RefreshPrices` use case is already partial-failure tolerant and does not overwrite prices on failure. No seeding changes. |
| IV. Pragmatic Testing | ✅ | One small unit test asserting the new schedule string + timezone assumption. Frontend deletion is verified by build + visual check; no test required. |
| V. Convention-Driven Workflow | ✅ | Branch is `feature/daily-prices-workflow`. Commits will use conventional prefixes (`feat:`, `chore:`, `docs:`). |

**Gate result**: PASS. No constitution violations; Complexity Tracking section below is intentionally empty.

## Phase 0 — Research (decisions to lock before implementation)

**R-1. Function App OS — Linux vs Windows?**
The DST handling mechanism differs:
- **Windows Function Apps** → set the app setting `WEBSITE_TIME_ZONE` to a Windows TZ ID (e.g. `Eastern Standard Time`); CRON expressions are evaluated in that local time, DST-aware.
- **Linux Function Apps** → set the app setting `TZ` to an IANA TZ name (e.g. `America/New_York`); CRON expressions are evaluated in that local time, DST-aware.

**Decision needed during implementation**: inspect the deployed Function App's OS once, then pick exactly one app setting to add. Both approaches yield identical results; the cron expression `0 30 16 * * 1-5` is the same in both.

**Why ~30 min after close (16:30 ET) and not at the close (16:00 ET)**:
- The cash-equities session closes at 16:00 ET; some venues and Yahoo Finance need a few minutes for the final print to settle.
- Buffer absorbs any minor schedule drift on Consumption-plan cold starts.
- 30 min still well before any meaningful after-hours move would matter for end-of-day P&L.

**R-2. Existing timer location and use-case wiring** — already verified:
- `src/functions/refreshPricesTimer.js` calls `container.getRefreshPrices()` and invokes `useCase.execute({})`.
- The use case writes to `portfolioPositions` (current price + timestamp) and appends `portfolioPrices` records. No changes required.

**R-3. Dashboard surface to remove** — already verified:
- Button markup: `dashboard/src/pages/index.astro:16`.
- Handler: `attachRefreshButton()` in `dashboard/src/lib/portfolio-page.js:295-308` plus its call at line 311.
- "Last refresh" timestamp is rendered from `summary.lastPriceRefreshAt` in `portfolio-page.js:135-137` — kept as-is.

## Phase 1 — Design (artifact summaries)

### Project Structure (feature artifacts)

```text
specs/001-daily-prices-refresh/
├── plan.md              # This file
├── spec.md              # Feature spec
├── checklists/
│   └── requirements.md  # Spec-quality checklist
└── tasks.md             # Generated by /speckit-tasks
```

No `research.md`, `data-model.md`, or `contracts/` files are required for this feature:
- No data model changes (existing Position/Price entities, no schema migration).
- No new HTTP contracts (existing `POST /api/prices/refresh` is retained unchanged).
- Research findings small enough to inline in this plan (Phase 0 above).

### Source Code (repository root)

```text
my-finances/
├── src/
│   ├── application/
│   │   └── use-cases/prices/
│   │       └── RefreshPrices.js          # UNCHANGED
│   └── functions/
│       ├── refreshPrices.js              # UNCHANGED (operator HTTP endpoint)
│       └── refreshPricesTimer.js         # MODIFY schedule + comment
├── dashboard/
│   └── src/
│       ├── pages/
│       │   └── index.astro               # REMOVE refresh-btn element
│       └── lib/
│           └── portfolio-page.js         # REMOVE attachRefreshButton + its call
├── README.md                              # Update "Price refresh" line
└── CLAUDE.md                              # Note the button retirement
```

**Structure Decision**: Existing project layout (clean/DDD Azure Functions + Astro dashboard) is preserved. The feature is narrow — two backend files and two frontend files plus docs.

### Backend change — `src/functions/refreshPricesTimer.js`

- Replace schedule string `'0 0 2 * * *'` with `'0 30 16 * * 1-5'`.
- Update the header comment from "Runs daily at 02:00 UTC (23:00 ART)" to "Runs at 16:30 ET (≈ NYSE close + 30 min), weekdays only. Requires Function App TZ setting (`WEBSITE_TIME_ZONE=Eastern Standard Time` on Windows or `TZ=America/New_York` on Linux)."
- Handler body unchanged — same `container.getRefreshPrices().execute({})` call.
- **Concurrency**: Azure Functions timer trigger registrations are implicitly singleton — the runtime prevents a second invocation from starting while one is still in flight. This satisfies spec FR-008 with no additional code.

### Backend config change — Function App app setting (in-repo)

- Function App is **Linux** (confirmed by `--linux-fx-version "Node|22"` at `.github/workflows/deploy-azure-function.yml:55`).
- The deploy workflow already calls `az functionapp config appsettings set` on every deploy (lines 57–63). Extend that step to also set `TZ=America/New_York`. This makes DST handling automatic on every deploy — no manual portal step required, eliminating a class of "forgot to apply" incidents.
- README still mentions the requirement so an operator inspecting the Function App's Configuration tab understands why `TZ` is set.

### Frontend changes

- `dashboard/src/pages/index.astro` — delete line 16 (`<button id="refresh-btn" ...>`). The flex container `flex items-end justify-between flex-wrap gap-4` still renders correctly with only the left child (title + "Last refresh"); the `justify-between` becomes a no-op visually but no CSS edit is required.
- `dashboard/src/lib/portfolio-page.js` — delete the `attachRefreshButton()` function definition (lines 295–308) and remove the `attachRefreshButton();` call from inside `initPortfolioPage()` (line 311) so it becomes:
  ```js
  export function initPortfolioPage() {
    load();
  }
  ```
- `api` import retained — used by `load()` for other endpoints.

### Documentation changes

- `README.md` — update the "Price refresh" line to "Daily timer-triggered ~30 min after the NYSE close (weekdays). Manual UI trigger removed. Operator HTTP endpoint retained for debugging."
- `CLAUDE.md` — under "API endpoints", add: "The dashboard no longer exposes a manual refresh button; `POST /api/prices/refresh` is retained as an operator-only endpoint protected by the existing function key."

### Tests

- Add `tests/functions/refreshPricesTimer.test.js` (new) with a single unit test asserting the exported schedule constant matches `0 30 16 * * 1-5`. (To keep the test trivial, extract the schedule into a top-level `const SCHEDULE = '0 30 16 * * 1-5'` in the timer file so it's importable for testing without binding to `@azure/functions`.) This is the only test added for this feature.

## Complexity Tracking

*Empty — Constitution Check passed with no violations.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| _(none)_ | _(none)_ | _(none)_ |

## Ready for `/speckit-tasks`

This plan is concrete enough to generate a numbered, dependency-ordered task list. Proceed to `/speckit-tasks`.
