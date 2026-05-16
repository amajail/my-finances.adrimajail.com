/**
 * Timer trigger for automatic price refresh.
 *
 * Runs at 16:30 ET (≈ NYSE regular-hours close + 30 minutes) on US trading
 * weekdays (Mon–Fri). DST-aware via the Function App's `TZ` app setting
 * (`TZ=America/New_York` on Linux hosts; `WEBSITE_TIME_ZONE=Eastern Standard
 * Time` on Windows hosts). The deploy workflow sets `TZ` automatically — see
 * `.github/workflows/deploy-azure-function.yml`.
 *
 * Azure Functions timer registrations are implicitly singleton: the runtime
 * will not start a second invocation while one is still in flight, which
 * satisfies the "no concurrent refresh runs" requirement (spec FR-008).
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');

/**
 * Cron expression (NCRONTAB six-field format, evaluated in the Function App's
 * local time zone): seconds minutes hours day-of-month month day-of-week.
 *
 *   0 30 16 * * 1-5  →  every Mon–Fri at 16:30 local time.
 *
 * Exported so unit tests can pin the schedule without instantiating the
 * Azure Functions runtime.
 */
const SCHEDULE = '0 30 16 * * 1-5';

app.timer('refreshPricesTimer', {
  schedule: SCHEDULE,
  handler: async (_myTimer, context) => {
    try {
      const useCase = container.getRefreshPrices();
      const result = await useCase.execute({});
      context.log('Price refresh complete', result);
    } catch (err) {
      context.log.error('Price refresh failed', err.message || err);
    }
  },
});

module.exports = { SCHEDULE };
