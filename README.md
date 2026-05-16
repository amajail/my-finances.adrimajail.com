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

## Develop

```bash
npm install
npm test
npm start  # boots Azure Functions on localhost:7071
```

See `.env.example` for required environment variables.
