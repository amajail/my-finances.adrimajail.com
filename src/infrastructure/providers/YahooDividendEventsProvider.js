/**
 * Yahoo Dividend Events Provider
 *
 * Feature 017 (research D1): fetches declared upcoming dividend dates and the
 * annualized dividend rate via yahoo-finance2 `quoteSummary` (modules
 * calendarEvents + summaryDetail). Per-share estimate assumes quarterly
 * cadence (`dividendRate / 4`) — always an estimate (FR-008).
 *
 * Resilience contract (IDividendEventsProvider): NEVER rejects. Each lookup
 * is timeboxed; a failed symbol lands in `failedSymbols`; all lookups failing
 * sets `sourceAvailable: false` so the calendar degrades instead of breaking
 * (FR-007). Only ticker symbols are sent to Yahoo — no quantities or costs
 * (constitution I).
 */

const IDividendEventsProvider = require('../../application/interfaces/IDividendEventsProvider');
const SymbolMapper = require('./SymbolMapper');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const LOOKUP_TIMEOUT_MS = 3000;

class YahooDividendEventsProvider extends IDividendEventsProvider {
  /**
   * @param {Object} [client=yahooFinance] - injectable for tests
   * @param {number} [timeoutMs=3000]
   */
  constructor(client = yahooFinance, timeoutMs = LOOKUP_TIMEOUT_MS) {
    super();
    this._client = client;
    this._timeoutMs = timeoutMs;
  }

  get name() { return 'yahoo-dividends'; }

  async getUpcomingDividends(holdings = []) {
    const lookups = holdings
      .map((h) => ({ holding: h, providerSymbol: SymbolMapper.toYahooDividendSymbol(h) }))
      .filter((l) => l.providerSymbol !== null);

    if (lookups.length === 0) {
      return { facts: [], failedSymbols: [], sourceAvailable: true };
    }

    const results = await Promise.all(lookups.map((l) => this._lookupOne(l)));
    const facts = results.filter((r) => r.fact !== null).map((r) => r.fact);
    const failedSymbols = results.filter((r) => r.failed).map((r) => r.symbol);
    // Vacuously available when nothing was eligible; unavailable only when
    // every attempted lookup failed (total outage).
    const sourceAvailable = failedSymbols.length < lookups.length;

    return { facts, failedSymbols, sourceAvailable };
  }

  async _lookupOne({ holding, providerSymbol }) {
    try {
      const raw = await this._withTimeout(
        this._client.quoteSummary(providerSymbol, { modules: ['calendarEvents', 'summaryDetail'] }),
        providerSymbol
      );
      const exDate = this._toIsoDate(raw?.calendarEvents?.exDividendDate);
      const payDate = this._toIsoDate(raw?.calendarEvents?.dividendDate);
      const rate = typeof raw?.summaryDetail?.dividendRate === 'number' ? raw.summaryDetail.dividendRate : null;
      if (exDate === null && payDate === null) {
        // No declared dividend — a normal outcome, not a failure.
        return { symbol: holding.symbol, fact: null, failed: false };
      }
      return {
        symbol: holding.symbol,
        failed: false,
        fact: {
          symbol: holding.symbol,
          exDate,
          payDate,
          perShareAnnualRate: rate,
          perShareEstimate: rate !== null ? rate / 4 : null,
        },
      };
    } catch (_err) {
      return { symbol: holding.symbol, fact: null, failed: true };
    }
  }

  _withTimeout(promise, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`dividend lookup timed out: ${label}`)), this._timeoutMs);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }

  _toIsoDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
}

module.exports = YahooDividendEventsProvider;
