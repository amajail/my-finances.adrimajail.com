# Quickstart: Weekly Context Capture

**Feature**: 006-weekly-context-capture

Local dev recipe to exercise the new macro capture, totals, and position changes.

## Prerequisites

- Functions running locally: `npm start` (or `func start`) on `http://localhost:7071/api`.
- Azurite running for Table Storage.
- Brokers + positions seeded (`node scripts/seed-brokers.js`, `node scripts/seed-positions.js`).
- Active instructions document configured (feature 005) — required for the analysis to run.

## Configuration (local.settings.json — gitignored, never commit real values)

```jsonc
{
  "Values": {
    "ANTHROPIC_API_KEY": "sk-ant-...",        // existing
    "analysis.fredApiKey": "your-free-fred-key", // new — from fredaccount.stlouisfed.org
    "analysis.imfModel": "claude-haiku-4-5-20251001", // optional override
    "analysis.imfStalenessWeeks": "8"          // optional override
  }
}
```
> If `analysis.fredApiKey` is absent, the three FRED-backed indicators (US inflation, US rate,
> and — if FRED is used for S&P — drawdown) return `available:false`. The run still succeeds.
> S&P drawdown defaults to keyless Stooq, so it works without the FRED key.

## Run a weekly analysis

The generation path is the Friday timer (no HTTP trigger). To run locally, invoke the timer
function via the Functions host Test/Run, or call the use-case from a one-off script:

```js
// scripts/run-analysis-once.js (local only; do not commit with real output)
const { getContainer } = require('../src/application/di/container');
(async () => {
  const useCase = getContainer().getGenerateWeeklyAnalysis();
  const res = await useCase.execute({}); // targetDate defaults to the upcoming/closest Friday
  console.log(res.status, res.date);
})();
```

## Verify

1. **Detail API** includes the new blocks:
   ```bash
   curl "http://localhost:7071/api/analysis/weekly/<YYYY-MM-DD>?code=<key>" | jq \
     '{macroContext, portfolioTotals, positionChanges}'
   ```
   - All 9 `macroContext` keys present; each has `value`/`asOf`/`available`.
   - `bcraReserves.basis === "gross"`.
   - `portfolioTotals` has totals + `mepRate` + `mepRateAsOf`.
   - `positionChanges` is `null` on the first ever run; `[]` or a list thereafter.

2. **Resilience**: temporarily point a provider URL at a bad host (or unset the FRED key) and
   re-run — the run still completes; the affected indicator shows `available:false`; others
   populate. (SC-002)

3. **Position changes are exact**: edit one holding's quantity
   (`PUT /api/positions/{broker}/{rowKey}` with `{ "quantity": N }`), re-run, confirm exactly
   that position appears with correct before/after/delta and nothing else. (SC-005)

4. **Dashboard**: open `dashboard` (`npm run dev` under `dashboard/`), navigate to the analysis
   detail page for the date, and confirm the three new blocks render (Macro Context grouped
   AR/US/Global; Portfolio Totals; Changes this week). Unavailable indicators show greyed out.

5. **Pre-feature rows**: open an older analysis detail page — it renders with the new blocks
   absent/"not recorded", no errors. (FR-020)

## Tests

```bash
npm run test:unit          # entity validation, PositionChangeCalculator, providers (mocked fetch)
npm run test:integration   # provider fixtures, repository round-trip (Azurite)
```
Use clearly-fake holdings data in all fixtures (Constitution I).
