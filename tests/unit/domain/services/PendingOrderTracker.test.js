const PendingOrderTracker = require('../../../../src/domain/services/PendingOrderTracker');

const { MAX_CONSECUTIVE_ISSUES, MAX_LOOKBACK_WEEKS } = PendingOrderTracker;

const order = (over = {}) => ({
  index: 0, broker: 'BROKER', symbol: 'SYMBOL', side: 'buy', quantity: 5, executionStatus: 'pending', ...over,
});
const week = (date, orders = [order()], extra = {}) => ({
  date, status: 'completed', positionChanges: [], orders, confirmationItems: [], ...extra,
});
// Newest first helper: dates 2026-01-30, 01-23, 01-16, ...
const dates = ['2026-01-30', '2026-01-23', '2026-01-16', '2026-01-09', '2026-01-02', '2025-12-26', '2025-12-19', '2025-12-12', '2025-12-05'];
const weeks = (n, orders) => dates.slice(0, n).map((d) => week(d, orders));
const TARGET = '2026-02-06';

describe('PendingOrderTracker', () => {
  it('exposes the single configurable limit', () => {
    expect(MAX_CONSECUTIVE_ISSUES).toBe(3);
    expect(MAX_LOOKBACK_WEEKS).toBe(8);
  });

  it('returns [] with no prior analyses', () => {
    expect(PendingOrderTracker.build({ targetDate: TARGET, analyses: [] })).toEqual([]);
  });

  it('2 consecutive pending weeks is a fresh carry-over', () => {
    const [c] = PendingOrderTracker.build({ targetDate: TARGET, analyses: weeks(2) });
    expect(c).toMatchObject({ key: 'BROKER|SYMBOL|buy', ageWeeks: 2, reason: 'fresh', lastDate: '2026-01-30', lastIndex: 0, originDate: '2026-01-23' });
  });

  it('3 consecutive pending weeks is stale', () => {
    const [c] = PendingOrderTracker.build({ targetDate: TARGET, analyses: weeks(3) });
    expect(c).toMatchObject({ ageWeeks: 3, reason: 'stale' });
  });

  it('caps the age at the lookback window', () => {
    const [c] = PendingOrderTracker.build({ targetDate: TARGET, analyses: weeks(9) });
    expect(c.ageWeeks).toBe(8);
  });

  it('ignores analyses on or after the target date, and skips failed ones without counting them', () => {
    const analyses = [
      week('2026-02-06', [order()]),
      week('2026-01-30', [order()], { status: 'failed' }),
      week('2026-01-23', [order()]),
      week('2026-01-16', [order()]),
    ];
    const [c] = PendingOrderTracker.build({ targetDate: '2026-02-06', analyses });
    expect(c.ageWeeks).toBe(2);
    expect(c.lastDate).toBe('2026-01-23');
  });

  it('ends the chain at a week without the order', () => {
    const analyses = [week(dates[0]), week(dates[1], []), week(dates[2]), week(dates[3])];
    const [c] = PendingOrderTracker.build({ targetDate: TARGET, analyses });
    expect(c.ageWeeks).toBe(1);
  });

  it('ends the chain when the order was marked, and never counts the opposite side', () => {
    const analyses = [
      week(dates[0]),
      week(dates[1], [order({ executionStatus: 'skipped' })]),
      week(dates[2], [order({ side: 'sell' })]),
    ];
    const chains = PendingOrderTracker.build({ targetDate: TARGET, analyses });
    expect(chains).toHaveLength(1);
    expect(chains[0].ageWeeks).toBe(1);
  });

  it('does not start a chain from an order that is not in the newest prior week', () => {
    const analyses = [week(dates[0], []), week(dates[1]), week(dates[2])];
    expect(PendingOrderTracker.build({ targetDate: TARGET, analyses })).toEqual([]);
  });

  it('tracks two keys independently', () => {
    const two = [order(), order({ index: 1, symbol: 'OTHER', side: 'sell' })];
    const analyses = [week(dates[0], two), week(dates[1], [order()])];
    const chains = PendingOrderTracker.build({ targetDate: TARGET, analyses });
    const byKey = Object.fromEntries(chains.map((c) => [c.key, c]));
    expect(byKey['BROKER|SYMBOL|buy'].ageWeeks).toBe(2);
    expect(byKey['BROKER|OTHER|sell'].ageWeeks).toBe(1);
  });

  describe('carry-forward of confirmation items (FR-014)', () => {
    const item = (over = {}) => ({
      broker: 'BROKER', symbol: 'SYMBOL', side: 'buy', quantity: 5, ageWeeks: 3, originDate: '2026-01-16',
      lastDate: '2026-01-23', lastIndex: 0, reason: 'stale', proposedStatus: null, ...over,
    });

    it('keeps the order escalated in the weeks after it stops being issued', () => {
      // Orders in 01-16 and 01-23 (stale at 01-30 run); 01-30 and 02-06 carry only the item.
      const analyses = [
        week('2026-02-06', [], { confirmationItems: [item({ ageWeeks: 4 })] }),
        week('2026-01-30', [], { confirmationItems: [item()] }),
        week('2026-01-23', [order()]),
        week('2026-01-16', [order()]),
        week('2026-01-09', [order()]),
      ];
      const [c] = PendingOrderTracker.build({ targetDate: '2026-02-13', analyses });
      expect(c).toMatchObject({ reason: 'stale', lastDate: '2026-01-23', lastIndex: 0 });
      expect(c.ageWeeks).toBe(5);
    });

    it('ends once the pointed row is recorded, so a fresh order starts at age 0', () => {
      const analyses = [
        week('2026-01-30', [], { confirmationItems: [item()] }),
        week('2026-01-23', [order({ executionStatus: 'skipped' })]),
        week('2026-01-16', [order()]),
      ];
      expect(PendingOrderTracker.build({ targetDate: '2026-02-06', analyses })).toEqual([]);
    });
  });

  describe('likely-filled (cross-week fill proposal)', () => {
    it('proposes executed from a later week and escalates even when young', () => {
      const analyses = [
        week(dates[0], [order()], { positionChanges: [{ broker: 'BROKER', symbol: 'SYMBOL', change: 'increased', deltaQuantity: 5 }] }),
        week(dates[1], [order()]),
      ];
      const [c] = PendingOrderTracker.build({ targetDate: TARGET, analyses });
      expect(c).toMatchObject({ ageWeeks: 2, reason: 'likely-filled', proposedStatus: 'executed' });
    });

    it('uses the target week position changes as evidence too', () => {
      const [c] = PendingOrderTracker.build({
        targetDate: TARGET,
        analyses: weeks(1),
        currentPositionChanges: [{ broker: 'BROKER', symbol: 'SYMBOL', change: 'increased', deltaQuantity: 2 }],
      });
      expect(c).toMatchObject({ reason: 'likely-filled', proposedStatus: 'partial' });
    });

    it('does not count a change in the issue week itself (it predates the order)', () => {
      const analyses = [week(dates[0], [order()], { positionChanges: [{ broker: 'BROKER', symbol: 'SYMBOL', change: 'increased', deltaQuantity: 5 }] })];
      const [c] = PendingOrderTracker.build({ targetDate: TARGET, analyses });
      expect(c.reason).toBe('fresh');
    });
  });

  describe('confirmationItems()', () => {
    it('returns items only for non-fresh chains, with the row pointer', () => {
      const chains = PendingOrderTracker.build({ targetDate: TARGET, analyses: weeks(3) });
      expect(PendingOrderTracker.confirmationItems(chains)).toEqual([{
        broker: 'BROKER', symbol: 'SYMBOL', side: 'buy', quantity: 5, ageWeeks: 3,
        originDate: '2026-01-16', lastDate: '2026-01-30', lastIndex: 0, reason: 'stale', proposedStatus: null,
      }]);
      expect(PendingOrderTracker.confirmationItems(PendingOrderTracker.build({ targetDate: TARGET, analyses: weeks(2) }))).toEqual([]);
    });
  });
});
