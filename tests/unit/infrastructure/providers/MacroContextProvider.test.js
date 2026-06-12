/**
 * MacroContextProvider orchestrator tests (feature 006, FR-004 / SC-002).
 *   - assembles all 9 readings when sources succeed
 *   - a failing source becomes available:false; others still populate
 *   - reserves carry basis:"gross"; IMF usage is aggregated
 *   - never throws
 */

const MacroContextProvider = require('../../../../src/infrastructure/providers/MacroContextProvider');

function deps(over = {}) {
  return {
    riesgoPaisProvider: { getLatest: jest.fn().mockResolvedValue({ basisPoints: 524, asOf: '2026-06-10' }) },
    fxGapProvider: { getLatest: jest.fn().mockResolvedValue({ gapPct: 0.3, asOf: '2026-06-11' }) },
    bcraProvider: { getVariable: jest.fn(async (id) => (id === 1 ? { value: 47834, asOf: '2026-06-09' } : { value: 29, asOf: '2026-06-10' })) },
    inflationProvider: { getLatest: jest.fn().mockResolvedValue({ percent: 2.1, asOf: '2026-05-31' }) },
    fredProvider: { getLatestObservation: jest.fn(async (s) => (s === 'CPIAUCSL' ? { value: 3.1, asOf: '2026-05-01' } : { value: 4.5, asOf: '2026-06-11' })) },
    sp500Provider: { getLatest: jest.fn().mockResolvedValue({ drawdownPct: -2.4, asOf: '2026-06-11' }) },
    imfStatusProvider: { getLatest: jest.fn().mockResolvedValue({ status: 'approved', asOf: '2026-05-21', usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.0002 } }) },
    ...over,
  };
}

describe('MacroContextProvider', () => {
  it('assembles all nine readings when every source succeeds', async () => {
    const { readings, usage } = await new MacroContextProvider(deps()).getLatest({ priorImfReading: null });

    expect(Object.keys(readings)).toHaveLength(9);
    expect(readings.riesgoPais).toMatchObject({ value: 524, available: true });
    expect(readings.bcraReserves).toMatchObject({ value: 47834, available: true, basis: 'gross' });
    expect(readings.argInterestRate.value).toBe(29);
    expect(readings.usaInflation.value).toBe(3.1);
    expect(readings.usaInterestRate.value).toBe(4.5);
    expect(readings.imfReviewStatus.value).toBe('approved');
    expect(usage.costUsd).toBeCloseTo(0.0002, 4);
  });

  it('marks a failing source available:false and still populates the rest (never throws)', async () => {
    const d = deps({
      fredProvider: { getLatestObservation: jest.fn().mockRejectedValue(new Error('FRED down')) },
      riesgoPaisProvider: { getLatest: jest.fn().mockRejectedValue(new Error('riesgo down')) },
    });
    const { readings } = await new MacroContextProvider(d).getLatest({ priorImfReading: null });

    expect(readings.riesgoPais).toEqual({ value: null, asOf: null, available: false });
    expect(readings.usaInflation.available).toBe(false);
    expect(readings.usaInterestRate.available).toBe(false);
    // Independent sources unaffected.
    expect(readings.fxGap.available).toBe(true);
    expect(readings.bcraReserves.available).toBe(true);
    expect(readings.imfReviewStatus.available).toBe(true);
  });

  it('threads the prior IMF reading to the IMF provider for carry-forward', async () => {
    const d = deps();
    await new MacroContextProvider(d).getLatest({ priorImfReading: { value: 'approved', asOf: '2026-05-21' } });
    expect(d.imfStatusProvider.getLatest).toHaveBeenCalledWith({ priorReading: { value: 'approved', asOf: '2026-05-21' } });
  });
});
