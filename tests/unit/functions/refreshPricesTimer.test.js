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

const mockExecute = jest.fn();
jest.mock('../../../src/application/di/container', () => ({
  getRefreshPrices: () => ({ execute: mockExecute }),
}));

const { SCHEDULE, handler } = require('../../../src/functions/refreshPricesTimer');

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

describe('refreshPricesTimer handler', () => {
  let context;
  beforeEach(() => {
    mockExecute.mockReset();
    context = { log: Object.assign(jest.fn(), { error: jest.fn() }), warn: jest.fn() };
  });

  it('does not warn when every instrument refreshed', async () => {
    mockExecute.mockResolvedValue({ totalSymbols: 3, succeeded: 3, failed: 0 });
    await handler({}, context);
    expect(context.warn).not.toHaveBeenCalled();
  });

  it('warns with counts only when some instruments failed', async () => {
    mockExecute.mockResolvedValue({ totalSymbols: 3, succeeded: 2, failed: 1 });
    await handler({}, context);
    expect(context.warn).toHaveBeenCalledWith(expect.stringContaining('1 failed of 3'), {
      failed: 1, succeeded: 2, totalSymbols: 3,
    });
  });

  it('does not warn when the task itself threw (runTimer logs the error)', async () => {
    mockExecute.mockRejectedValue(new Error('boom'));
    await handler({}, context);
    expect(context.warn).not.toHaveBeenCalled();
    expect(context.log.error).toHaveBeenCalled();
  });
});
