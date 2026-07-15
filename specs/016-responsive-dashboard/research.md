# Research: Mobile-Responsive Dashboard

Phase 0 output. All decisions below resolve the "NEEDS CLARIFICATION" implied by
the spec's open design choices. No external research required — this is a
CSS/layout feature on an existing Astro + Tailwind v4 stack.

## Decision 1 — Navigation pattern on narrow viewports

**Decision**: Full horizontal `<ul>` shown at `lg+` (≥1024px). Below `lg`, hide it
and show a hamburger toggle button that reveals a full-width, vertically stacked
menu panel. Toggle via a few lines of vanilla JS in `Layout.astro` (flip a
`hidden` class + `aria-expanded`).

**Rationale**: The measured nav is 809px wide; it only fits inside the padded
`max-w-6xl` container at ≥~840px, so `lg` (1024px) is the safe switch point. A
disclosure panel is the standard mobile-nav affordance and keeps all nine
destinations reachable with zero horizontal scroll. Vanilla JS avoids adding any
framework/dependency (Constitution: no unjustified deps).

**Alternatives considered**:
- *Horizontal-scroll nav*: rejected — reintroduces sideways scrolling, the exact
  thing we're eliminating.
- *Wrapping the nav to multiple rows*: rejected — visually noisy, unstable height,
  still cramped at 360px.
- *CSS-only `<details>`/checkbox hack*: viable and JS-free, but duplicates markup
  or fights sticky-header stacking; a 6-line script is clearer and gives proper
  `aria-expanded`.

## Decision 2 — Wide-table strategy on narrow viewports

**Decision**: Reflow read-only analytical tables to stacked label/value cards
below `sm` (640px), using a reusable `.table-stack` class in `global.css` plus
`data-label` attributes on each `<td>`. Interactive CRUD tables (positions,
brokers) keep horizontal-scroll containment (`overflow-x-auto`) instead.

**Rationale**: The owner explicitly chose stacked cards over scroll. The
`data-label` + CSS pattern (`thead` hidden, `tr`→block card, `td`→flex row with
`::before { content: attr(data-label) }`) is dependency-free, works for both
server-rendered and client-JS-rendered tables, and degrades to a normal table at
`sm+`. Positions/brokers carry inline `<input>`s and multiple action buttons per
row that do not reflow into a label/value card sensibly, so they use the spec's
sanctioned scroll fallback (positions already has it; brokers gains it).

**Alternatives considered**:
- *Reflow everything including CRUD tables*: rejected — inline edit inputs and
  three action buttons per row break the label/value card model and risk the edit
  UX.
- *Scroll containment everywhere*: rejected — ignores the owner's card preference
  for the read-heavy analysis pages.
- *A JS table→cards transformer component*: rejected — heavier, and the CSS
  pattern achieves the same with less code and no runtime cost.

## Decision 3 — Touch-target sizing

**Decision**: Mobile nav links use `py-3` block links (~44px tall) and the
hamburger toggle is sized to at least 44×44px. Desktop nav link sizing is
unchanged (mouse target, `lg+` only).

**Rationale**: ~44px is the widely-cited comfortable minimum finger target;
the audit measured the current links at 30px. Applying it only on the mobile
panel avoids changing the desktop bar.

## Decision 4 — Breakpoints

**Decision**: Nav switches at `lg` (1024px); tables reflow at `sm` (640px).

**Rationale**: Driven by the measured widths (nav 809px → needs `lg`; tables
482–759px are scroll-contained above `sm` and carded below it). The two
breakpoints are independent; Phase Verify confirms no width between 320px and
desktop produces horizontal document overflow.

## Verification method

Playwright MCP: set viewport to 320, 360, and a desktop width; for each of the 9
pages, assert `document.documentElement.scrollWidth <= clientWidth` and measure
nav tap-target heights. Baseline (pre-change): 9/9 pages overflow by up to 531px;
nav links 30px tall. Target: 0/9 overflow; nav targets ≥44px.
