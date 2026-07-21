# Quickstart: Dividend & Maturity Calendar (017)

## Run locally

```bash
# backend (reads local.settings.json — the real cloud store; timers disabled locally)
func start

# probe the endpoint
curl "http://localhost:7071/api/calendar?days=180"

# dashboard
cd dashboard && npm run dev   # then open /calendar
```

## What to verify (maps to spec success criteria)

1. **SC-001** — every open fixed-income position with a `maturityDate` inside the horizon appears once under the right month; `fixedIncomeWithoutMaturity` matches the count of open fixed-income rows lacking a date.
2. **SC-004** — at 360 px viewport, `/calendar` has zero horizontal document scroll (reuse the feature-016 Playwright audit: `browser_resize` to 360×800, check `document.documentElement.scrollWidth <= 360`).
3. **SC-005 / FR-007** — simulate dividend-source failure (disconnect network for Yahoo or stub the provider to throw): page still renders maturities + shows the degraded notice.
4. **FR-005** — run a weekly analysis locally with an event inside 28 days: the prompt (inspect via unit test, never logs) contains `## upcomingEvents`; with none, the block is absent.
5. **FR-010** — a month with one null-amount event shows the excluded-count note and a total equal to the sum of the others.

## Tests

```bash
npm test -- --testPathPattern="Calendar|calendar|upcomingEvents"
npm run test:coverage   # thresholds must stay green
cd dashboard && npx eslint . && npm run build
```

## Privacy reminders (constitution I)

- Test fixtures use fake symbols/quantities only.
- Never commit screenshots of the calendar with real data (`verify-*.png` is gitignored — keep it that way).
- Dividend lookups send ticker symbols only — no quantities, costs, or totals leave the system.
