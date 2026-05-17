# Quickstart: Verifying Dashboard Metrics Trim

**Feature**: 003-dashboard-metrics-trim
**Audience**: Whoever just implemented or is reviewing the feature.

This is a 5-minute manual smoke check. No automated tests are added by this feature (see `research.md`, Decision 7).

## Prerequisites

- Local Azure Functions backend reachable at `http://localhost:7071/api` (via `npm start` in repo root or `func start`).
- Azurite running and `portfolioPositions` table seeded with at least:
  - One broker with **multiple positions** (the more, the better the sort check).
  - One broker with **mixed currencies** (USD + ARS positions) — Galicia or IOL usually qualify after running `scripts/seed-positions.js` with placeholder data.
  - **At least one position with `currentPrice == null`** to exercise the "—" fallback.
- Dashboard dev server reachable at the usual port (typically `npm run dev` inside `dashboard/`).

## Steps

### 1. Load the home page

Open the dashboard root (`/`). Wait for the brokers section and per-broker positions tables to render.

**Expected**:
- The page renders without console errors.
- The header (`#grand-total`, `#last-refresh`, MEP rate), the `#stat-row` (4 cells), the `#brokers-section` cards, and the Top/Bottom performers panels at the bottom all look **identical to before this feature**. (Spec FR-007 and SC-004.)

### 2. Inspect a per-broker positions table

Look at any broker section under `#positions-by-broker`.

**Expected**:
- The table has **exactly 4 column headers, in this order**: **Symbol**, **Value**, **P&L**, **%**. (Spec FR-001, AC-1.)
- The headers Quantity / Qty, PPC, and Last are **gone**. No hover, click, or expand interaction exposes them. (Spec FR-002.)
- The header for **Value** shows a **▼ sort indicator** on first render, indicating the table is sorted by Value descending. (Spec FR-003a, AC-2.)
- Rows are ordered with the **largest market value at the top**. Confirm by eyeballing — the topmost row's Value cell is the biggest number in the table.

### 3. Verify each cell type

For a typical row in the broker with mixed currencies:

| Cell | Expect to see |
|------|---------------|
| Symbol | `{SYMBOL}` (bold) followed by a small lowercase asset-type tag (`cedear`, `stock`, `bond`, etc.). |
| Value | An integer followed by the currency code (e.g. `1234 USD` or `5678 ARS`). Right-aligned, monospace. |
| P&L | An integer, no currency suffix. Right-aligned, monospace. Colored green for gains, red for losses, neutral for zero/null. |
| % | A signed two-decimal percentage with a leading sign (`+1.23%` / `-4.56%`). Same color cue as P&L. |

For the row with a missing current price:

- Value, P&L, and % all show `—` (em-dash). (Spec edge case 1.)
- The empty values do not throw or display `NaN` / `Infinity`.

### 4. Verify sorting works on the remaining columns

Click each remaining column header in turn:

| Click | Expected sort indicator | Expected row order |
|-------|--------------------------|---------------------|
| Symbol | `▲` on Symbol, indicator removed from Value | Rows sorted A → Z by symbol. |
| Symbol (again) | `▼` on Symbol | Rows sorted Z → A by symbol. |
| Value | `▲` on Value | Rows sorted smallest → largest market value. |
| P&L | `▲` on P&L | Rows sorted by P&L ascending (biggest losses at top). |
| % | `▼` on % (click twice) | Rows sorted by % descending (biggest gainers at top). |

(Spec FR-003, AC-3.)

**Expected absence**: no column header for Quantity, PPC, or Last exists, so they cannot be clicked. (Spec FR-003.)

### 5. Verify the asset-type filter still works on the trimmed columns

Pick a broker whose table shows filter pills (a broker holding more than one asset type). Click a non-`all` pill (e.g., `cedear`).

**Expected**:
- The table re-renders showing only positions of that asset type.
- The table **still has the same four columns** (Symbol, Value, P&L, %). (Spec FR-004, AC-4.)
- The active sort (Value descending unless overridden) is preserved across the filter change.

Click `all` to return to the unfiltered state. Confirm the rows return.

### 6. Empty-state check

If you can briefly seed a broker with **zero open positions** (or already have one), confirm the table body renders a single full-width row reading something like "No matching positions." spanning the **4 columns** (not 7).

(Spec edge case 3.)

### 7. Visual diff — the rest of the dashboard

Compare the rest of the page against the pre-feature state (mental model or git stash):

- `#grand-total` text — same.
- `#stat-row` — same 4 cells, same labels, same values.
- `#brokers-section` cards — same per-broker USD / ARS totals.
- `#top-performers` / `#bottom-performers` — same content, same `+X.XX%` format.

(Spec SC-004.)

---

## Done when

All 7 steps above pass. If anything is off, re-read `research.md` Decision 3 and `data-model.md` View-Model table for the cell that's misbehaving.

## What you do NOT need to do

- Run any test suite (this feature adds none).
- Restart the Azure Functions backend.
- Re-seed positions or refresh prices.
- Touch the Positions page, Brokers page, Analysis page, or Settings page.
