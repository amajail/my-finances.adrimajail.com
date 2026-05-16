# Tasks: Daily Automatic Price Refresh

**Input**: Design documents from `specs/001-daily-prices-refresh/`

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [checklists/requirements.md](./checklists/requirements.md)

**Tests**: One unit test included (per plan's Pragmatic Testing principle).

**Organization**: Tasks grouped by user story (US1, US2, US3). US1 and US2 are both P1 and can be implemented in either order; they touch disjoint files.

## Format: `[ID] [P?] [Story] Description`

- **[P]** = can run in parallel with other [P] tasks (different files, no dependencies)
- **[Story]** = user story id from spec.md
- **[Shared]** = setup or shared concern, not story-specific

---

## Phase 1 — Setup (Shared Infrastructure)

- [x] **T001** [Shared] Verify the deployed Function App's OS. **Resolved**: Linux — confirmed by `--linux-fx-version "Node|22"` at `.github/workflows/deploy-azure-function.yml:55`. Timezone setting is `TZ=America/New_York` (IANA).

## Phase 2 — Foundational

*(none — this feature has no shared foundational work that blocks the user-story tasks.)*

---

## Phase 3 — User Story 1 (P1): Prices refresh automatically after each US market close

**Goal**: Move the existing timer to fire ~30 minutes after the NYSE close, DST-aware, weekdays only.

**Independent Test**: After deploying and setting the TZ app setting, observe in Function App "Monitor" that the next-run time lands at 16:30 ET on the next US weekday; the next executed run updates `currentPriceUpdatedAt` and the dashboard's `Last refresh` accordingly.

- [ ] **T010** [US1] Extract the cron expression into a top-level exported constant in `src/functions/refreshPricesTimer.js` so it is importable for testing:
  ```js
  const SCHEDULE = '0 30 16 * * 1-5';
  module.exports = { SCHEDULE };
  ```
  …and update the `app.timer(...)` registration to reference `SCHEDULE`.
- [ ] **T011** [US1] In the same file, update the header docblock and inline comment to read: "Runs at 16:30 ET (≈ NYSE close + 30 min), Mon–Fri. Requires `WEBSITE_TIME_ZONE=Eastern Standard Time` (Windows host) or `TZ=America/New_York` (Linux host) app setting." Remove the old "02:00 UTC (23:00 ART)" note.
- [ ] **T012** [P] [US1] Create `tests/functions/refreshPricesTimer.test.js`:
  ```js
  const { SCHEDULE } = require('../../src/functions/refreshPricesTimer');
  test('timer schedule fires 30 min after NYSE close on weekdays', () => {
    expect(SCHEDULE).toBe('0 30 16 * * 1-5');
  });
  ```
  Verify `npm test` passes.
- [ ] **T013** [US1] Add `"TZ=America/New_York"` to the existing `az functionapp config appsettings set` step in `.github/workflows/deploy-azure-function.yml` (lines 57–63) so the timezone is applied automatically on every deploy. Also mention the setting in `README.md` so an operator inspecting the Function App's Configuration tab understands why it's set.

---

## Phase 4 — User Story 2 (P1): Manual "Refresh prices" UI control removed

**Goal**: Strip the manual refresh button and its handler from the dashboard. Keep the "Last refresh" timestamp.

**Independent Test**: Load the dashboard locally (`npm run dev` in `dashboard/`); the button is gone, the timestamp still renders, no console errors.

- [ ] **T020** [P] [US2] Delete the `<button id="refresh-btn" class="row-action-btn">Refresh prices</button>` element on `dashboard/src/pages/index.astro:16`. Leave the surrounding `<div class="flex items-end justify-between flex-wrap gap-4">` and its left child (`<h1 id="grand-total">` + "Last refresh" paragraph) intact.
- [ ] **T021** [P] [US2] In `dashboard/src/lib/portfolio-page.js`:
  - Delete the entire `attachRefreshButton()` function (lines 295–308).
  - Remove the `attachRefreshButton();` call inside `initPortfolioPage()` so the function becomes just `load();`.
  - Confirm `api` and other imports are still referenced by `load()` and other helpers (they are — leave them).
- [ ] **T022** [US2] Run `cd dashboard && npm run build`; confirm zero errors and no references to `refresh-btn` remain in the build output. Run two greps in `dashboard/src`:
  - `grep -R "refresh-btn\|attachRefreshButton\|Refresh prices" dashboard/src` — must return **zero** hits (button gone).
  - `grep -R "last-refresh" dashboard/src` — must return **at least one** hit (timestamp element still present, per FR-010).

---

## Phase 5 — User Story 3 (P2): Operator-level manual refresh remains possible

**Goal**: Confirm the existing HTTP endpoint stays in place and is still function-key-protected.

**Independent Test**: With the Function App function key, `curl -X POST https://<app>.azurewebsites.net/api/prices/refresh?code=<key>` returns the standard `{ totalSymbols, succeeded, failed, durationMs }` response.

- [ ] **T030** [US3] No code change required for `src/functions/refreshPrices.js` — verify by inspection that it still exists, exports the HTTP function, and uses `authLevel: 'function'`. Record this in the PR description so reviewers know the endpoint is intentionally retained.
- [ ] **T031** [US3] Update `CLAUDE.md` "API endpoints" section: under `POST /api/prices/refresh`, append "(operator-only after this PR; no UI control)".

---

## Phase 6 — Polish & Verification

- [ ] **T040** [Shared] Run the full local verification listed in plan.md's verification path:
  - `npm test` — passes (includes T012's new test).
  - `cd dashboard && npm run build` — succeeds.
  - `grep -R "refresh-btn\|attachRefreshButton\|Refresh prices" dashboard/src` — empty.
  - `grep "SCHEDULE" src/functions/refreshPricesTimer.js` — shows `'0 30 16 * * 1-5'`.
- [ ] **T041** [Shared] Commit incrementally with conventional prefixes — one commit per user story plus one for docs is the suggested split:
  - `feat: shift price-refresh timer to 30 min after NYSE close (US1)`
  - `chore: remove manual refresh button from dashboard (US2)`
  - `docs: clarify operator-only manual refresh endpoint (US3 + README/CLAUDE.md)`
- [ ] **T042** [Shared] Open a PR to `main` referencing `specs/001-daily-prices-refresh/`. In the PR body include: a link to the spec, the Function App OS finding from T001, and a reminder that the `WEBSITE_TIME_ZONE` / `TZ` app setting must be applied post-deploy.

---

## Dependency Graph

```
T001 (verify OS)
   │
   ├─► T010 ─► T011 ─► T012 ─► T013      (US1)
   │
   ├─► T020 ──┐                            (US2 — independent of US1)
   │          ├─► T022
   └─► T021 ──┘
   │
   ├─► T030 ─► T031                       (US3)
   │
   └─► T040 ─► T041 ─► T042               (Polish)
```

US1 and US2 each form independent MVP slices; either could ship alone (with the other deferred) and deliver a meaningful subset of the value.
