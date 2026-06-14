# Quickstart — Analysis Token Diet (feature 011)

Goal: confirm a run uses fewer tokens (both sides) with all six tables still present, and know the owner levers for cutting further.

## 1. Capture the baseline (already have one)

Per-run telemetry is on each `WeeklyAnalysis` (`tokensIn`/`tokensOut`/`costUsd`), shown on the analysis-detail header and via the API:

```bash
curl -s "http://localhost:7071/api/analysis/weekly/<date>" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log('in',a.tokensIn,'out',a.tokensOut,'usd',a.costUsd);})"
```

Reference baseline (pre-feature, 2026-06-13): **21,729 in / 7,962 out / $0.7463**.

## 2. Run after the change and compare

```bash
# delete a date and re-run (real Anthropic call), then compare telemetry
node scripts/delete-analysis.local.js <date>
curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer -H 'Content-Type: application/json' -d '{}'
# poll GET /api/analysis/weekly/<today>, then compare tokensIn/out to the baseline
```

**Expect**: both `tokensIn` and `tokensOut` lower; all six structured tables still populated; narrative coherent and not restating the tables. (~25% total is the directional goal, not a hard gate — week-to-week holdings variance is expected.)

## 3. Verify nothing was lost

- Open `analysis-detail?date=<today>`: bucket/asset-class drift, concentration caps, watchlist, week-over-week, framework amendments all still render.
- The dashboard still shows portfolio totals and (where used) best/worst performers — only the *prompt* dropped those; persistence/display are unchanged.

## 4. Owner levers for cutting further (no code)

These are also surfaced in the `/instructions` editing guide:

- **Trim the active instructions body** (`/instructions` editor): it's the largest variable per-run contributor. Remove prose that restates the now-tabular sections or asks for long multi-section narratives.
- **Model tier** (`analysis.model` setting): a cheaper tier (e.g. `claude-sonnet-4-6`) is ~5× cheaper in and out — a quality tradeoff, switchable without code. Default stays Opus.
- **`analysis.maxOutputTokens`**: lower it to hard-cap output spend (note: this caps by truncation; the feature itself does not).

## 5. Revert the performer removal (if needed)

Best/worst performers were dropped from the prompt because they're derivable from the holdings already sent. If you find the narrative degraded, restore them by removing the `topPerformers`/`bottomPerformers` deletion in `_buildUserMessage`'s `summaryForPrompt` reduction (one line) — `PortfolioCalculator.summary()` still produces them.

## 6. Tests

```bash
npm test    # updated GenerateWeeklyAnalysis prompt-assembly assertions
            # (portfolioTotals block removed, compact JSON, performers absent, preamble concision present)
```
