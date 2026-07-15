# Implementation Plan: Mobile-Responsive Dashboard

**Branch**: `016-responsive-dashboard` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-responsive-dashboard/spec.md`

## Summary

Make all nine Astro dashboard pages usable in portrait on a phone (target 360px,
guard to 320px) with **no horizontal document scroll**, while leaving the
desktop layout unchanged. The Playwright audit proved the dominant cause is the
shared top navigation — nine links in one non-wrapping `flex` row (809px) that
inflate the `<body>` width on every page and, as a side effect, defeat the
`overflow-x-auto` table containers that four of the five table pages already have.

Approach, in priority order:
1. **Nav (P1, the linchpin):** replace the single horizontal `<ul>` with a
   responsive pattern — full horizontal bar at `lg+` (≥1024px, where the 809px
   nav fits), and a collapsible hamburger panel below `lg`. Mobile nav links and
   the toggle get ≥44px touch targets. Once `<body>` stops overflowing, the
   existing `overflow-x-auto` containers re-engage on their own.
2. **Tables (P2):** add a reusable `.table-stack` CSS pattern (in `global.css`)
   that reflows a table into stacked label/value cards below the `sm` breakpoint
   (<640px), driven by `data-label` attributes on each `<td>`. Apply it to the
   **read-only analytical tables** (scorecard, analysis list, and the analysis-detail
   tables). The two **CRUD tables with inline inputs/buttons** (positions, brokers)
   use the sanctioned horizontal-scroll fallback instead — positions already has
   `overflow-x-auto`; brokers needs it added.
3. **No desktop regression (P3):** all new behaviour is gated behind `lg:`/`sm:`
   Tailwind breakpoints, so `≥1024px` renders exactly as today.

## Technical Context

**Language/Version**: JavaScript (ES modules), Astro 6, Tailwind CSS v4

**Primary Dependencies**: Astro, `@tailwindcss/vite`, `@amajail/ui` (existing — no new deps)

**Storage**: N/A (presentation-only feature)

**Testing**: Manual + Playwright MCP viewport verification at 320/360/desktop widths;
existing dashboard has no component test harness (static Astro pages)

**Target Platform**: Mobile web (Samsung Galaxy S-class, 360×780 portrait) + existing desktop

**Project Type**: Web frontend (Astro static site under `dashboard/`)

**Performance Goals**: No JS framework added; nav toggle is a few lines of vanilla JS. No perf concern.

**Constraints**: Zero horizontal document overflow at ≤360px; ≥44px touch targets; no desktop change; no new runtime dependency.

**Scale/Scope**: 1 shared layout + `global.css` + 4 table pages touched (brokers, scorecard, analysis, analysis-detail). 9 pages verified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Privacy First (NON-NEGOTIABLE)**: ✅ Presentation-only. No holdings data in
  code/commits. Playwright audit screenshots (which capture real holdings) are
  gitignored and were deleted; verification will re-run locally without committing
  artifacts.
- **II. Clean Architecture / DDD**: ✅ No backend/domain/use-case changes. Frontend
  layout only; no business rules touched.
- **III. Idempotent Data Operations**: ✅ N/A — no data operations.
- **IV. Pragmatic Testing**: ✅ Verification via Playwright viewport probes; no
  existing tests broken (frontend has none for these pages).
- **V. Convention-Driven Workflow**: ✅ Branch `016-responsive-dashboard` is the bare
  `NNN-kebab` speckit format matching the spec dir. PR to `main`.
- **Tech Stack & Constraints**: ✅ No new npm packages, Azure services, or data stores.

**Result: PASS.** No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/016-responsive-dashboard/
├── plan.md              # This file
├── spec.md              # Feature spec (with audit findings)
├── research.md          # Phase 0 — breakpoint & nav-pattern decisions
├── data-model.md        # Phase 1 — N/A (no data model)
├── quickstart.md        # Phase 1 — how to verify responsiveness
├── contracts/           # Phase 1 — N/A (no API/interface change)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
dashboard/
├── src/
│   ├── layouts/
│   │   └── Layout.astro        # PRIMARY: responsive nav (hamburger < lg)
│   ├── styles/
│   │   └── global.css          # ADD: .table-stack responsive-table pattern
│   └── pages/
│       ├── brokers.astro       # add overflow-x-auto (scroll fallback)
│       ├── scorecard.astro     # apply .table-stack + data-label on <td>
│       ├── analysis.astro      # apply .table-stack + data-label on <td>
│       ├── analysis-detail.astro # apply .table-stack + data-label to its tables
│       ├── positions.astro     # already overflow-x-auto — no change (fallback)
│       ├── charts.astro        # already responsive — verify only
│       ├── performance.astro   # fits — verify only
│       ├── settings.astro      # fits — verify only
│       ├── instructions.astro  # fits — verify only
│       └── index.astro         # cards — verify only
```

**Structure Decision**: Existing Astro `dashboard/` frontend. Changes confined to
one shared layout, one stylesheet, and four page templates. No backend touched.

## Complexity Tracking

> Not required — Constitution Check passed with no violations.

## Phase Notes

- **Nav breakpoint = `lg` (1024px)**: the full 809px nav needs ~840px to fit inside
  the `max-w-6xl` padded container; `lg` is the smallest standard Tailwind stop that
  clears it. Tablets (768–1023px) get the hamburger — acceptable per FR-003
  ("desktop-class" = ≥1024px).
- **Table reflow breakpoint = `sm` (640px)**: phones get cards; ≥640px keeps
  columnar tables (scroll-contained). Nav and table breakpoints differ by design and
  are independently non-overflowing at every width (verified in Phase: Verify).
- **Reflow vs. scroll split**: read-only tables reflow to cards (nicer on phone);
  interactive CRUD tables (positions inline-edit inputs + 3 action buttons/row;
  brokers edit/delete) keep scroll containment — the spec's explicit fallback for
  tables that don't reflow sensibly.
- **Nav toggle**: minimal vanilla JS in `Layout.astro` (`hidden` class + `aria-expanded`);
  no framework, no new dependency.
