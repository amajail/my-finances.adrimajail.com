# my-finances

Self-hosted portfolio tracker for stocks, bonds, deposits, and cash across
multiple brokers.

- **Backend**: Azure Functions v4 (Node.js)
- **Storage**: Azure Table Storage
- **Dashboard**: Astro (separate `dashboard/` folder)
- **Price refresh**: Timer-triggered ~30 minutes after the NYSE regular-hours
  close on US trading weekdays (cron `0 30 16 * * 1-5`, evaluated in
  `America/New_York` via the `TZ` app setting that the deploy workflow
  applies automatically). Pulls from Yahoo Finance (stocks/ETFs/CEDEARs),
  IOL, and Cohen (Argentine fixed income). No manual UI trigger — the HTTP
  endpoint `POST /api/prices/refresh` is retained as an operator escape
  hatch, protected by the Function App key.
- **Weekly rebalance analysis**: Friday 17:00 ET timer fires
  `GenerateWeeklyAnalysis`, which asks Claude (Anthropic SDK, default
  `claude-opus-4-7`, configurable via `portfolioSettings`) for a written
  strategic analysis + structured buy/sell orders. Inputs: current portfolio,
  prior week's analysis, a macro context panel (riesgo país among nine
  indicators, via `api.argentinadatos.com` and friends), and the owner's
  instructions document (stored in `portfolioSettings` — NOT in the repo),
  used verbatim as the system prompt. Output persists to `portfolioAnalysis`
  + `portfolioOrders` and renders on the dashboard at `/analysis` (list) +
  `/analysis-detail?date=YYYY-MM-DD` (detail). If the MEP (dólar bolsa) rate
  provider is down, the portfolio summary reports `fxDegraded` with USD
  aggregates nulled — never a silent 1:1 — and the weekly run refuses with a
  failed row instead of analyzing unreliable figures. Requires
  `ANTHROPIC_API_KEY` in Function App settings. Full design lives under
  `specs/002-weekly-rebalance-analysis/`; local-dev recipe in that feature's
  `quickstart.md`.
- **Editable analysis instructions**: the complete system prompt is one
  owner-edited instructions document, editable from the dashboard at
  `/instructions` with append-only version history (every save becomes an
  immutable row in `portfolioInstructionsHistory`; restore creates a new
  entry, never mutates). Each weekly analysis is linked to the exact
  instructions version that produced it. Full design in
  `specs/005-editable-metaprompt/` (which retired the `/framework` page and
  prompt-template file of `specs/004-editable-strategic-framework/`).

## Develop

```bash
npm install
npm test
npm start  # boots Azure Functions on localhost:7071
```

See `.env.example` for required environment variables.
