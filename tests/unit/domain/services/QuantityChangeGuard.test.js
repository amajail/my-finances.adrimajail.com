/**
 * QuantityChangeGuard domain service — feature 018 (spec FR-004).
 */

const QuantityChangeGuard = require('../../../../src/domain/services/QuantityChangeGuard');

describe('QuantityChangeGuard', () => {
  it('does not exceed for a change under the threshold', () => {
    const result = QuantityChangeGuard.evaluate(100, 120, 50);
    expect(result).toEqual({ exceeds: false, changePct: 20 });
  });

  it('does not exceed exactly at the threshold (strictly-greater comparison)', () => {
    const result = QuantityChangeGuard.evaluate(100, 150, 50);
    expect(result).toEqual({ exceeds: false, changePct: 50 });
  });

  it('exceeds just past the threshold, both up and down', () => {
    expect(QuantityChangeGuard.evaluate(100, 151, 50).exceeds).toBe(true);
    expect(QuantityChangeGuard.evaluate(100, 49, 50).exceeds).toBe(true);
    expect(QuantityChangeGuard.evaluate(100, 49, 50).changePct).toBe(51);
  });

  it('always exceeds on reduction to zero, regardless of threshold', () => {
    const result = QuantityChangeGuard.evaluate(10, 0, 100);
    expect(result.exceeds).toBe(true);
    expect(result.changePct).toBe(100);
  });

  it('always exceeds when growing from zero (relative change undefined)', () => {
    const result = QuantityChangeGuard.evaluate(0, 5, 50);
    expect(result.exceeds).toBe(true);
    expect(result.changePct).toBeNull();
  });

  it('respects a custom threshold', () => {
    expect(QuantityChangeGuard.evaluate(100, 115, 10).exceeds).toBe(true);
    expect(QuantityChangeGuard.evaluate(100, 115, 20).exceeds).toBe(false);
  });
});
