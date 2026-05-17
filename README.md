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
  prior week's analysis (narrative + portfolio snapshot), Argentina riesgo
  país (via `api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo`),
  and the owner's strategic framework (stored as `analysis.strategicFrameworkV1`
  in `portfolioSettings` — NOT in the repo). Output persists to two new
  tables (`portfolioAnalysis`, `portfolioOrders`) and renders on the dashboard
  at `/analysis` (list) + `/analysis-detail?date=YYYY-MM-DD` (detail).
  Requires `ANTHROPIC_API_KEY` in Function App settings. Full design lives
  under `specs/002-weekly-rebalance-analysis/`; local-dev recipe in that
  feature's `quickstart.md`. The prompt template at
  `src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md` is
  generic; the owner's framework content (bucket→symbol mappings, target
  allocations, deploy priorities, standing directives) is injected at
  runtime from settings to keep personal data out of git.
- **Editable strategic framework**: the framework prompt is editable from
  the dashboard at `/framework` with append-only version history (every save
  becomes an immutable row in `portfolioFrameworkHistory`; restore creates
  a new entry, never mutates). Each weekly analysis is linked to the exact
  framework version that produced it. Full design in
  `specs/004-editable-strategic-framework/`.

## Develop

```bash
npm install
npm test
npm start  # boots Azure Functions on localhost:7071
```

See `.env.example` for required environment variables.
