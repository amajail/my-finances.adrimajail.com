/**
 * Unit test for the price-refresh timer schedule.
 *
 * The handler itself is exercised indirectly via the `RefreshPrices` use case
 * tests; this file pins the cron expression so a future "let's tweak the
 * schedule" PR can't silently shift it without surfacing here.
 */

// `@azure/functions` v4 registers app handlers at module-import time. We mock
// the `app.timer` registration so importing the timer file in a unit test
// doesn't try to attach to a real Functions host.
jest.mock('@azure/functions', () => ({
  app: { timer: jest.fn() },
}));

const { SCHEDULE } = require('../../../src/functions/refreshPricesTimer');

describe('refreshPricesTimer schedule', () => {
  it('fires at 16:30 local time (NYSE close + 30 min) on weekdays', () => {
    // Format: seconds minutes hours day-of-month month day-of-week
    //         0       30      16    *               *     1-5
    expect(SCHEDULE).toBe('0 30 16 * * 1-5');
  });

  it('is a six-field NCRONTAB expression (Azure Functions format)', () => {
    expect(SCHEDULE.split(/\s+/)).toHaveLength(6);
  });
});
