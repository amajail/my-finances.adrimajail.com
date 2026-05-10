/**
 * Timer trigger for automatic price refresh
 * Runs daily at 02:00 UTC (23:00 ART)
 */

const { app } = require('@azure/functions');
const container = require('../application/di/container');

/**
 * Timer trigger for automatic price refresh
 * Schedule: 0 0 2 * * * = 02:00 UTC daily (23:00 ART)
 */
app.timer('refreshPricesTimer', {
  schedule: '0 0 2 * * *',
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
