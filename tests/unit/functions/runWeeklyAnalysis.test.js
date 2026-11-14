/**
 * POST /api/analysis/weekly/run — registration and handler smoke tests.
 * @azure/functions is mocked to capture the registration; the use case is stubbed.
 */

jest.mock('@azure/functions', () => ({
  app: { http: jest.fn() },
}));

jest.mock('../../../src/application/di/container', () => ({
  getRerunWeeklyAnalysis: jest.fn(),
}));

const { app } = require('@azure/functions');
const container = require('../../../src/application/di/container');
const { AppError } = require('../../../src/shared/errors');

require('../../../src/functions/runWeeklyAnalysis');

const [name, config] = app.http.mock.calls[0];
const context = { log: Object.assign(jest.fn(), { error: jest.fn() }) };
const requestWith = (json) => ({ json });

describe('POST /api/analysis/weekly/run registration', () => {
  it('registers a function-key POST route', () => {
    expect(name).toBe('runWeeklyAnalysis');
    expect(config.methods).toEqual(['POST']);
    expect(config.authLevel).toBe('function');
    expect(config.route).toBe('analysis/weekly/run');
  });
});

describe('POST /api/analysis/weekly/run handler', () => {
  it('runs without force when the body is empty or not JSON', async () => {
    const execute = jest.fn().mockResolvedValue({ date: '2026-01-10', status: 'completed' });
    container.getRerunWeeklyAnalysis.mockReturnValue({ execute });

    const res = await config.handler(requestWith(async () => { throw new SyntaxError('no body'); }), context);

    expect(execute).toHaveBeenCalledWith({ force: false });
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ date: '2026-01-10', status: 'completed' });
  });

  it('passes force only for a literal true', async () => {
    const execute = jest.fn().mockResolvedValue({ date: '2026-01-10', status: 'completed' });
    container.getRerunWeeklyAnalysis.mockReturnValue({ execute });

    await config.handler(requestWith(async () => ({ force: 'true' })), context);
    expect(execute).toHaveBeenLastCalledWith({ force: false });

    await config.handler(requestWith(async () => ({ force: true })), context);
    expect(execute).toHaveBeenLastCalledWith({ force: true });
  });

  it('maps a guard refusal to 409', async () => {
    container.getRerunWeeklyAnalysis.mockReturnValue({
      execute: jest.fn().mockRejectedValue(new AppError('a weekly analysis run is already in progress', 409)),
    });

    const res = await config.handler(requestWith(async () => ({})), context);

    expect(res.status).toBe(409);
    expect(res.jsonBody.error).toMatch(/already in progress/);
  });
});
