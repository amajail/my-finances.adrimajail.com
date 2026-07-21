/**
 * CalendarEventBuilder Domain Service
 *
 * Feature 017: pure derivation of calendar events from position snapshots and
 * dividend facts. No I/O, no clock access — `today` is injected.
 *
 * Maturity amounts follow research decision D3: the USD estimate is the
 * position's existing `valueUsd` (per-100-nominales convention already
 * applied upstream), so the calendar always agrees with every other page.
 * Dividend amounts for CEDEARs are deliberately omitted (ratio unknown, D2):
 * date-only events instead of wrong numbers.
 */

const FIXED_INCOME_TYPES = ['bond', 'bopreal', 'lecap', 'on', 'deposit'];
const DAY_MS = 24 * 60 * 60 * 1000;

class CalendarEventBuilder {
  /**
   * @param {Object} args
   * @param {Array<Object>} args.positions - open-position snapshot rows
   *   (brokerId, assetType, symbol, quantity, currency, currentPrice,
   *   valueUsd, status, maturityDate)
   * @param {Array<Object>} args.dividendFacts - provider facts
   *   ({ symbol, exDate, payDate, perShareEstimate }) — may be []
   * @param {number} args.horizonDays - forward window in days
   * @param {Date} args.today - injected clock (date-only precision)
   * @returns {{ events: Array<Object>, fixedIncomeWithoutMaturity: number }}
   */
  static build({ positions = [], dividendFacts = [], horizonDays, today }) {
    const todayUtc = CalendarEventBuilder._utcMidnight(today);
    const open = positions.filter((p) => (p.status || 'open') !== 'closed');
    const events = [];
    let fixedIncomeWithoutMaturity = 0;

    // Maturity events (FR-001). Overdue (past date, still open) are always
    // included regardless of horizon (FR-009).
    for (const p of open) {
      if (!FIXED_INCOME_TYPES.includes(p.assetType)) continue;
      const date = CalendarEventBuilder._parseDate(p.maturityDate);
      if (date === null) {
        fixedIncomeWithoutMaturity += 1;
        continue;
      }
      const daysUntil = Math.round((date - todayUtc) / DAY_MS);
      if (daysUntil > horizonDays) continue;
      const quantity = Number(p.quantity) || 0;
      // Native estimate: current market value in the instrument's currency
      // (per-100 quote convention for bonds/bopreal/lecap/on); deposits carry
      // their quantity as the amount. Converges to redemption near maturity.
      const perHundred = p.assetType === 'deposit' ? null : Number(p.currentPrice);
      const amountNative = p.assetType === 'deposit'
        ? quantity
        : (Number.isFinite(perHundred) ? (quantity * perHundred) / 100 : quantity);
      const amountUsd = Number.isFinite(Number(p.valueUsd)) && Number(p.valueUsd) > 0
        ? Number(p.valueUsd)
        : null;
      events.push({
        type: 'maturity',
        date: CalendarEventBuilder._iso(date),
        daysUntil,
        overdue: daysUntil < 0,
        symbol: p.symbol,
        broker: p.brokerId,
        assetType: p.assetType,
        quantity,
        amountNative,
        currency: p.currency || null,
        amountUsd,
        estimated: true,
        source: 'position',
      });
    }

    // Dividend events (FR-002). Never emitted for past dates; CEDEARs are
    // date-only (amounts null).
    const bySymbol = new Map(open.map((p) => [String(p.symbol).toUpperCase(), p]));
    for (const fact of dividendFacts) {
      const p = bySymbol.get(String(fact.symbol).toUpperCase());
      if (!p) continue;
      const isCedear = p.assetType === 'cedear';
      const quantity = Number(p.quantity) || 0;
      const perShare = isCedear ? null : fact.perShareEstimate;
      const amount = Number.isFinite(perShare) ? perShare * quantity : null;
      for (const [type, raw] of [['dividend-ex', fact.exDate], ['dividend-payment', fact.payDate]]) {
        const date = CalendarEventBuilder._parseDate(raw);
        if (date === null) continue;
        const daysUntil = Math.round((date - todayUtc) / DAY_MS);
        if (daysUntil < 0 || daysUntil > horizonDays) continue;
        events.push({
          type,
          date: CalendarEventBuilder._iso(date),
          daysUntil,
          overdue: false,
          symbol: p.symbol,
          broker: p.brokerId,
          assetType: p.assetType,
          quantity,
          amountNative: amount,
          currency: amount !== null ? 'USD' : null,
          amountUsd: amount,
          estimated: true,
          source: 'yahoo',
        });
      }
    }

    // Overdue maturities first (most negative daysUntil first), then all
    // future events ascending by date.
    events.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });

    return { events, fixedIncomeWithoutMaturity };
  }

  static _parseDate(value) {
    if (!value || typeof value !== 'string') return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(ts) ? ts : null;
  }

  static _utcMidnight(d) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  static _iso(utcTs) {
    return new Date(utcTs).toISOString().slice(0, 10);
  }
}

module.exports = CalendarEventBuilder;
