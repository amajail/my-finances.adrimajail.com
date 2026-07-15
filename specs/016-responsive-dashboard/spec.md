# Feature Specification: Mobile-Responsive Dashboard

**Feature Branch**: `016-responsive-dashboard`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "i want you to review the entire app for responsiveness, i have a samsung s26, use the playwright mcp for that"

## Context: Audit Findings

This spec is grounded in a live Playwright audit of every dashboard page rendered
at a **360 × 780 CSS-pixel viewport** (representative of a Samsung Galaxy S-class
phone in portrait; see Assumptions for the exact figure). Findings:

| Page | Horizontal overflow at 360px | Root cause |
|------|------------------------------|------------|
| **All pages** | 891px document width → **531px of sideways scroll** | Shared top nav `<ul>` (9 links in one non-wrapping flex row) is 809px wide |
| Positions | table 759px wide | Wide data table, no horizontal-scroll container |
| Analysis (list) | table 714px wide | Same |
| Analysis detail | 9 of 10 tables overflow, widest 711px | Same, stacked |
| Scorecard | table 584px wide | Same |
| Brokers | table 482px wide | Same |
| Charts | none (SVGs scale to 302px) ✓ | Already responsive |
| Performance | none (table 326px fits) ✓ | Narrow table |
| Settings | none ✓ | Form fits |
| Instructions | none ✓ | Prose reflows |

Two additional cross-cutting findings:

- **Touch targets**: all 9 nav links render at **30px tall**, below the ~44px
  minimum for reliable finger tapping.
- The nav is the dominant defect — it forces horizontal scrolling on 100% of
  pages, including the four that are otherwise clean.

The audit is a snapshot of "as-is" behaviour; the requirements below define the
"to-be" target. (The CORS console errors observed when loading the dev dashboard
via the `127.0.0.1` origin are unrelated to responsiveness and are out of scope —
see Assumptions.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read every page on a phone without sideways scrolling (Priority: P1)

As the sole user of my portfolio tracker, when I open any page on my phone I want
the page to fit the screen width so I can read it by scrolling only up and down —
never left and right — and I can reach every navigation destination.

**Why this priority**: This is the core of the request. The shared navigation bar
currently forces 531px of horizontal scroll on *every* page, so no page is usable
one-handed on a phone today. Fixing the nav alone lifts all nine pages out of the
"broken" state and is the minimum viable slice.

**Independent Test**: Load each page at a 360px-wide viewport; confirm the document
does not scroll horizontally (page width ≤ viewport width) and that every
navigation link is reachable and tappable.

**Acceptance Scenarios**:

1. **Given** any page open at a 360px-wide viewport, **When** it finishes loading,
   **Then** the page content does not extend beyond the viewport width (no
   horizontal scrollbar on the document / body).
2. **Given** the navigation on a narrow viewport, **When** the user wants to reach
   any of the nine destinations (Portfolio, Brokers, Positions, Analysis,
   Scorecard, Charts, Performance, Instructions, Settings), **Then** each is
   reachable through a mobile-appropriate navigation affordance without horizontal
   scrolling.
3. **Given** the navigation controls on a touch device, **When** the user taps a
   nav item, **Then** the tap target is at least ~44px in its smaller dimension.

---

### User Story 2 - Read wide data tables on a phone (Priority: P2)

When I open a page containing a data table (Positions, Brokers, Scorecard,
Analysis list, Analysis detail), I want to read the table without breaking the
page layout — the table's own width must not push the whole page sideways.

**Why this priority**: These five pages carry the actual portfolio content. After
the nav is fixed (P1) the tables become the next source of overflow. A table can
legitimately be wider than a phone screen, but that width must be contained so the
*page* stays fixed and only the *table* scrolls (or the table reflows).

**Independent Test**: At a 360px-wide viewport, load each table page; confirm the
page/body width equals the viewport and each wide table has reflowed to a stacked
label/value layout with every field readable.

**Acceptance Scenarios**:

1. **Given** the Positions page at 360px, **When** it loads its full holdings
   table, **Then** the page does not scroll horizontally and every row's data is
   readable as a stacked label/value card with no field hidden.
2. **Given** the Analysis-detail page (which stacks ~10 tables) at 360px, **When**
   it loads, **Then** each table reflows to the stacked layout and no table pushes
   the page wider than the viewport.
3. **Given** the same pages at desktop width, **When** they load, **Then** the
   tables render in their normal columnar form (the stacked layout applies only to
   narrow viewports).

---

### User Story 3 - No regression on tablet and desktop (Priority: P3)

When I open the same pages on a wider screen (tablet or desktop), the layout must
remain as it is today — the mobile adaptations must not degrade the large-screen
experience.

**Why this priority**: The dashboard is used from desktop too. Responsiveness work
must be additive at the small end, not a downgrade at the large end. Lower priority
because it is a guard-rail, not new value.

**Independent Test**: Load each page at a typical desktop width and confirm the
navigation and tables look and behave as they do today (full horizontal nav, full
tables, no horizontal scroll).

**Acceptance Scenarios**:

1. **Given** any page at a desktop-class width, **When** it loads, **Then** the
   full horizontal navigation is shown (no forced mobile menu) and no page scrolls
   horizontally.
2. **Given** a table page at desktop width, **When** it loads, **Then** tables that
   fit are shown in full without an unnecessary inner scrollbar.

---

### Edge Cases

- **Landscape phone / very narrow (~320px)**: the nav and tables must still avoid
  horizontal document overflow at the narrowest common phone width.
- **Long single-line values** (e.g., long broker notes, long symbols, ISO
  timestamps) inside table cells must not blow out column width past containment.
- **Nav open state**: if the mobile nav uses a collapsible menu, opening it must
  not itself introduce horizontal overflow or cover the page unusably.
- **Active-page indication**: the current page must remain visually indicated in
  whatever mobile nav form is chosen.
- **Zero-data / empty states** (e.g., an analysis date with few tables) must remain
  correctly contained.
- **Breakpoint boundary**: at the exact width where the layout switches between
  mobile and desktop nav, neither variant should overflow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every dashboard page MUST fit within the viewport width at 360px
  (and down to 320px) such that the document/body does not scroll horizontally.
- **FR-002**: The primary navigation MUST adapt to narrow viewports so that all
  nine destinations are reachable without horizontal scrolling (e.g., via a
  collapsible/stacked menu or an equivalent mobile pattern).
- **FR-003**: On wide (desktop-class) viewports the navigation MUST continue to
  present all destinations in the current horizontal bar form.
- **FR-004**: Interactive navigation controls MUST present touch targets of at
  least ~44px in their smaller dimension on touch/narrow viewports.
- **FR-005**: On narrow viewports, data tables that are wider than the viewport
  MUST reflow to a stacked, narrow-friendly layout (each row presented as a
  stacked label/value card) so the page does not scroll horizontally. This applies
  to Positions, Brokers, Scorecard, the Analysis list, and Analysis detail. (A
  contained horizontal-scroll region is an acceptable fallback only where a
  particular table cannot be sensibly reflowed; the default is reflow.)
- **FR-006**: The current/active page MUST remain visually indicated in the mobile
  navigation form.
- **FR-007**: The responsive changes MUST NOT alter the desktop layout or behaviour
  of any page that is already correct at desktop width (no visual regressions).
- **FR-008**: Pages already free of overflow (Charts, Performance, Settings,
  Instructions) MUST remain free of overflow after the changes.
- **FR-009**: Content inside contained tables MUST remain fully accessible — no
  columns hidden without an alternative means of viewing their data.

### Key Entities

*Not applicable — this feature changes presentation/layout only. No data model,
storage, or API changes are involved.*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At a 360px-wide viewport, **0 of 9** pages exhibit horizontal
  document overflow (measured as page/body scroll width ≤ viewport width). Baseline
  today: 9 of 9 overflow.
- **SC-002**: The sitewide horizontal overflow caused by the navigation drops from
  **531px to 0px** at 360px width.
- **SC-003**: **100%** of navigation destinations remain reachable on a 360px
  viewport without horizontal scrolling.
- **SC-004**: All navigation touch targets measure **≥ 44px** in their smaller
  dimension on narrow viewports (baseline: 30px).
- **SC-005**: For each of the five table pages, the page does not scroll
  horizontally while every column's data remains reachable, verified at 360px.
- **SC-006**: At desktop width, all nine pages render with **no** horizontal
  overflow and no change from current appearance (no regression).
- **SC-007**: The above hold at both 320px and 360px widths.

## Assumptions

- **Target viewport**: The Samsung Galaxy S26's exact CSS viewport was not
  specified; the audit and targets use **360 × 780 CSS px** portrait, consistent
  with recent Galaxy S-class devices and a conservative (narrow) test width. The
  "smaller phones" guard is set at **320px**. If the S26's actual portrait width
  differs, 360px remains a safe lower-bound target.
- **Scope is presentation-only**: layout, navigation, and table containment in the
  Astro dashboard. No backend, API, data model, or storage changes.
- **Touch-target figure**: ~44px is used as the minimum comfortable tap size
  (common mobile-accessibility guidance); the exact value is a design detail.
- **Table strategy (decided)**: on narrow viewports wide tables **reflow to
  stacked label/value cards** (owner's choice). A contained horizontal-scroll
  region is only a fallback for a table that cannot be sensibly reflowed. Either
  way the *page* never overflows and no data is hidden.
- **CORS / data-loading errors** seen in the dev environment when the dashboard is
  served from the `127.0.0.1` origin (API rejected the cross-origin request; the
  `localhost` origin worked) are a local dev-config matter, **out of scope** for
  this responsiveness feature.
- **Charts already responsive**: the SVG-based charts scale correctly and need no
  changes; they are called out only to prevent regressions.
- The single-user, internal nature of the app means no separate accessibility
  certification is required — the touch-target and no-horizontal-scroll goals are
  usability targets, not compliance deliverables.
