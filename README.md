# my-finances

Personal portfolio tracker. Stocks, bonds, and cash across 4 brokers + cash físico.

- **Backend**: Azure Functions v4 (Node.js)
- **Storage**: Azure Table Storage
- **Dashboard**: Astro + @amajail/ui (separate `dashboard/` folder, added in Phase 5)
- **Price refresh**: Daily timer-triggered function pulling from Yahoo Finance

## Develop

```bash
npm install
npm test
npm start  # boots Azure Functions on localhost:7071
```

See `.env.example` for required environment variables.
