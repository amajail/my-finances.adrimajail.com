---
description: "Task list for Mobile-Responsive Dashboard (feature 016)"
---

# Tasks: Mobile-Responsive Dashboard

**Input**: Design documents from `specs/016-responsive-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md (N/A), quickstart.md

**Tests**: No automated test tasks — the dashboard has no component test harness;
verification is via Playwright viewport probes (Phase: Polish). This matches the
plan's Pragmatic Testing note.

**Organization**: Grouped by the three user stories from spec.md (US1 nav = P1,
US2 tables = P2, US3 no-desktop-regression = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- All paths are relative to repo root.

---

## Phase 1: Setup

- [x] T001 Confirm local dev stack is reachable for verification: API at `http://localhost:7071/api` and Astro dev at `http://localhost:4321` (load via `localhost`, not `127.0.0.1`, per `specs/016-responsive-dashboard/quickstart.md`).

## Phase 2: Foundational (blocking prerequisite for US2)

- [x] T002 Add a reusable `.table-stack` responsive-table pattern to `dashboard/src/styles/global.css` inside `@layer components`: below the `sm` breakpoint (max-width 639.98px) set `.table-stack thead { display:none }`, `.table-stack tr { display:block }` (card border + spacing), `.table-stack td { display:flex; justify-content:space-between; gap:1rem; text-align:right }`, and `.table-stack td::before { content: attr(data-label); font-weight:600; text-align:left; color:var(--color-muted) }`; at `sm+` the table renders normally (no overrides). Hide the `::before` label for cells with no `data-label`.

**Checkpoint**: `.table-stack` exists and is a no-op at ≥640px.

---

## Phase 3: User Story 1 — Read every page on a phone without sideways scrolling (P1) 🎯 MVP

**Goal**: Kill the sitewide 531px horizontal overflow by making the shared nav
responsive with ≥44px touch targets. Fixing this alone lifts all 9 pages out of
the broken state.

**Independent test**: At 360px, every page has `scrollWidth == clientWidth`; the
hamburger toggles a stacked menu; all 9 destinations are reachable; active page is
indicated; nav tap targets ≥44px.

- [x] T003 [US1] In `dashboard/src/layouts/Layout.astro`, restructure the `<nav>`: keep the `my-finances` brand link; render the existing `navItems` `<ul>` as the desktop bar with `class="hidden lg:flex gap-1"`; add a hamburger `<button id="nav-toggle">` with `class="lg:hidden"`, `aria-label`, `aria-controls="mobile-nav"`, `aria-expanded="false"`, sized ≥44×44px (e.g. `h-11 w-11 inline-flex items-center justify-center`), containing an inline hamburger SVG.
- [x] T004 [US1] In `dashboard/src/layouts/Layout.astro`, add the mobile menu panel `<ul id="mobile-nav" class="hidden lg:hidden flex-col ...">` rendered from the same `navItems` map; each item is a full-width block link with `py-3` (≥44px tall) and a bottom border; preserve the active-item styling (`active === item.id`) so the current page stays indicated on mobile.
- [x] T005 [US1] In `dashboard/src/layouts/Layout.astro`, add a minimal inline `<script>` that toggles the `hidden` class on `#mobile-nav` and flips `#nav-toggle` `aria-expanded` on click; no framework/import. (Optional: close the panel on link click.)
- [x] T006 [US1] Sanity-check the sticky header stacking/`z-index` still works with the panel open (panel appears below the bar, above page content) — adjust classes in `dashboard/src/layouts/Layout.astro` only if needed.

**Checkpoint**: US1 done — at 360px no page scrolls horizontally from the nav, and
navigation is fully usable. This is the shippable MVP.

---

## Phase 4: User Story 2 — Read wide data tables on a phone (P2)

**Goal**: Ensure the five table pages never push the page sideways — read-only
analytical tables reflow to stacked cards; CRUD tables scroll within their container.

**Independent test**: At 360px, each table page has `scrollWidth == clientWidth`;
scorecard/analysis/analysis-detail tables render as label/value cards; positions/
brokers tables scroll inside their own container with the page fixed.

- [x] T007 [P] [US2] `dashboard/src/pages/brokers.astro`: add `overflow-x-auto` to the table's `card` container (line ~12) so the brokers CRUD table scrolls within its card (scroll fallback; brokers has inline edit/delete controls).
- [x] T008 [P] [US2] `dashboard/src/pages/scorecard.astro`: add `table-stack` to the `<table class="w-full text-sm">` and add a `data-label="<column header>"` attribute to every `<td>` in the client-rendered row template (Group/Executed/Partial/Skipped/Exec. rate columns).
- [x] T009 [P] [US2] `dashboard/src/pages/analysis.astro`: add `table-stack` to the list `<table>` and `data-label` to each `<td>` in the JS row template (Date/Status/Summary/Instructions… columns); keep the existing `overflow-x-auto` card as the ≥sm fallback.
- [x] T010 [US2] `dashboard/src/pages/analysis-detail.astro`: for each of its stacked tables (changes, admin, macro-wow, drift-bucket, drift-class, caps, and any others), add `table-stack` to the `<table>` and `data-label` to every `<td>` in the corresponding JS row template so each reflows to cards at <640px.
- [x] T011 [US2] Confirm `dashboard/src/pages/positions.astro` needs no change (already `overflow-x-auto`; interactive inline-edit table uses the scroll fallback) — verify only, no edit.

**Checkpoint**: US2 done — all five table pages are contained at 360px with data reachable.

---

## Phase 5: User Story 3 — No regression on tablet and desktop (P3)

**Goal**: Guarantee ≥1024px renders exactly as before.

**Independent test**: At 1280px, full horizontal nav shows (no hamburger), tables
are columnar with no unnecessary inner scrollbar, no page overflows.

- [x] T012 [US3] Verify with Playwright at 1280px that `dashboard/src/layouts/Layout.astro` shows the full horizontal nav (hamburger hidden) and the `.table-stack` pattern is inert (tables columnar); fix any breakpoint leakage in `Layout.astro`/`global.css` if found.

---

## Phase 6: Polish & Cross-Cutting Verification

- [x] T013 Playwright sweep at **360px** across all 9 pages (`/`, `/brokers`, `/positions`, `/analysis`, `/analysis-detail?date=<latest>`, `/scorecard`, `/charts`, `/performance`, `/instructions`, `/settings`): assert 0 horizontal overflow and measure a mobile nav link height ≥44px. Fix any offender.
- [x] T014 Playwright sweep at **320px** across the same 9 pages: assert 0 horizontal overflow (narrow-phone guard).
- [x] T015 Playwright check at **1280px**: assert 0 overflow and full desktop nav (regression guard) — corroborates T012.
- [x] T016 Do NOT commit Playwright artifacts (`.playwright-mcp/`, `audit-*.png`) — they capture real holdings and are gitignored; confirm `git status` is clean of them before the PR.

---

## Dependencies & Execution Order

- **Phase 1 (T001)** → **Phase 2 (T002)** → user-story phases.
- **US1 (T003–T006)** depends only on Setup — it is the MVP and can ship alone.
- **US2 (T007–T011)** depends on Foundational T002 (the `.table-stack` class). T007/T008/T009 touch different files → parallelizable `[P]`; T010 is larger; T011 is verify-only.
- **US3 (T012)** depends on US1 + US2 being in place.
- **Polish (T013–T016)** runs after US1–US3.

## Parallel Example

```
# After T002, run these together (different files):
T007  brokers.astro  (overflow-x-auto)
T008  scorecard.astro (table-stack + data-label)
T009  analysis.astro  (table-stack + data-label)
```

## Implementation Strategy

- **MVP = US1** (nav). Shipping only US1 already removes horizontal scroll on all
  nine pages and makes navigation usable — the single biggest win.
- **Increment 2 = US2** (table reflow/containment) for comfortable reading of the
  five data-table pages.
- **Increment 3 = US3** is a verification guard, not new UI.
- All work is behind `lg:`/`sm:` breakpoints, so desktop is safe throughout.
