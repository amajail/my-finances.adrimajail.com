# my-finances

Self-hosted portfolio tracker for stocks, bonds, deposits, and cash across
multiple brokers.

- **Backend**: Azure Functions v4 (Node.js)
- **Storage**: Azure Table Storage
- **Dashboard**: Astro (separate `dashboard/` folder)
- **Price refresh**: Daily timer-triggered function pulling from Yahoo Finance
  (stocks/ETFs) and Rava (Argentine fixed income)

## Develop

```bash
npm install
npm test
npm start  # boots Azure Functions on localhost:7071
```

See `.env.example` for required environment variables.
