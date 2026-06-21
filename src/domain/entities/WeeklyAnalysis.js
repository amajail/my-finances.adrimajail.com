/**
 * WeeklyAnalysis Entity
 *
 * One record per weekly run, keyed by the target Friday's date. Holds the
 * narrative body, run metadata (model, prompt version, token/cost telemetry),
 * the structured portfolio snapshot captured at run time (for next week's
 * delta inference), and either a `completed` payload or a `failed` reason.
 *
 * Immutable once constructed. Re-runs for the same date persist a NEW
 * WeeklyAnalysis instance that replaces the prior one wholesale.
 *
 * Feature: 002-weekly-rebalance-analysis (spec FR-019 + FR-019a).
 */

const { ValidationError } = require('../../shared/errors');

const STATUSES = ['completed', 'failed'];

/**
 * @typedef {Object} PortfolioSnapshotPosition
 * @property {string} broker
 * @property {string} assetType
 * @property {string} symbol
 * @property {number} quantity
 * @property {number} averageCost
 * @property {number|null} currentPrice
 * @property {string} currency
 * @property {number} valueUsd
 */

class WeeklyAnalysis {
  /**
   * @param {Object} data
   * @param {string} data.date - ISO YYYY-MM-DD (target Friday).
   * @param {string} data.status - 'completed' | 'failed'.
   * @param {string|Date} data.generatedAt - When the run started.
   * @param {string} data.modelUsed - e.g. 'claude-opus-4-7'.
   * @param {string} data.promptVersion - e.g. 'weekly-rebalance-v1'.
   * @param {string} [data.summary] - One-paragraph executive summary (required when completed).
   * @param {string} [data.markdownBody] - Full narrative (required when completed).
   * @param {number} [data.riesgoPaisBp]
   * @param {string} [data.riesgoPaisAsOf] - ISO YYYY-MM-DD.
   * @param {PortfolioSnapshotPosition[]} [data.portfolioSnapshot] - Default [].
   * @param {number} [data.tokensIn] - Default 0.
   * @param {number} [data.tokensOut] - Default 0.
   * @param {number} [data.costUsd] - Default 0.
   * @param {number} [data.durationMs] - Default 0.
   * @param {string} [data.errorMessage] - Required when status === 'failed'.
   * @param {string|null} [data.instructionsHistoryRowKey] - Feature 005: id of the
   *   InstructionsHistoryEntry whose content was the verbatim system prompt for
   *   this run. Null/absent for analyses produced before feature 005.
   * @param {string|null} [data.frameworkHistoryRowKey] - Feature 004 (legacy):
   *   id of the FrameworkHistoryEntry used by pre-005 analyses. Retained so old
   *   rows remain traceable; new runs leave it null and set
   *   instructionsHistoryRowKey instead.
   */
  constructor(data) {
    this._date = String(data.date || '').trim();
    this._status = String(data.status || '').trim();
    this._generatedAt = data.generatedAt ? new Date(data.generatedAt) : new Date();
    this._modelUsed = data.modelUsed || '';
    this._promptVersion = data.promptVersion || '';
    this._summary = data.summary || null;
    this._markdownBody = data.markdownBody || null;
    this._riesgoPaisBp = data.riesgoPaisBp !== undefined && data.riesgoPaisBp !== null
      ? parseInt(data.riesgoPaisBp, 10)
      : null;
    this._riesgoPaisAsOf = data.riesgoPaisAsOf || null;
    this._portfolioSnapshot = Array.isArray(data.portfolioSnapshot) ? data.portfolioSnapshot : [];
    this._tokensIn = data.tokensIn !== undefined ? Number(data.tokensIn) : 0;
    this._tokensOut = data.tokensOut !== undefined ? Number(data.tokensOut) : 0;
    this._costUsd = data.costUsd !== undefined ? Number(data.costUsd) : 0;
    this._durationMs = data.durationMs !== undefined ? Number(data.durationMs) : 0;
    this._errorMessage = data.errorMessage || null;
    this._instructionsHistoryRowKey = data.instructionsHistoryRowKey || null;
    this._frameworkHistoryRowKey = data.frameworkHistoryRowKey || null;
    // Feature 006: weekly context capture. All three are OPTIONAL — analyses
    // produced before the feature simply lack them (rendered "not recorded").
    this._macroContext = data.macroContext && typeof data.macroContext === 'object' && !Array.isArray(data.macroContext)
      ? data.macroContext
      : null;
    this._portfolioTotals = data.portfolioTotals && typeof data.portfolioTotals === 'object' && !Array.isArray(data.portfolioTotals)
      ? data.portfolioTotals
      : null;
    // null === "unknown" (no prior snapshot to diff). [] === "verified no
    // changes". A populated array === the week's changes. (FR-017.)
    this._positionChanges = Array.isArray(data.positionChanges) ? data.positionChanges : null;

    // Feature 010: structured analysis sections. All six are OPTIONAL — absent
    // (null) on pre-feature analyses and on runs that did not produce them.
    // Code-computed (from holdings + machine-readable targets):
    this._driftByBucket = Array.isArray(data.driftByBucket) ? data.driftByBucket : null;
    this._driftByAssetClass = Array.isArray(data.driftByAssetClass) ? data.driftByAssetClass : null;
    this._concentrationCaps = Array.isArray(data.concentrationCaps) ? data.concentrationCaps : null;
    // LLM-emitted (judgment):
    this._watchlist = Array.isArray(data.watchlist) ? data.watchlist : null;
    this._weekOverWeek = Array.isArray(data.weekOverWeek) ? data.weekOverWeek : null;
    this._frameworkAmendments = Array.isArray(data.frameworkAmendments) ? data.frameworkAmendments : null;

    // Feature 012: deterministic macro week-over-week comparison. OPTIONAL —
    // null on the first run (no prior panel to diff) and on pre-feature rows.
    this._macroChanges = Array.isArray(data.macroChanges) ? data.macroChanges : null;

    this._validate();
    Object.freeze(this._portfolioSnapshot);
    if (this._macroContext) Object.freeze(this._macroContext);
    if (this._portfolioTotals) Object.freeze(this._portfolioTotals);
    if (this._positionChanges) Object.freeze(this._positionChanges);
    if (this._driftByBucket) Object.freeze(this._driftByBucket);
    if (this._driftByAssetClass) Object.freeze(this._driftByAssetClass);
    if (this._concentrationCaps) Object.freeze(this._concentrationCaps);
    if (this._watchlist) Object.freeze(this._watchlist);
    if (this._weekOverWeek) Object.freeze(this._weekOverWeek);
    if (this._frameworkAmendments) Object.freeze(this._frameworkAmendments);
    if (this._macroChanges) Object.freeze(this._macroChanges);
    Object.freeze(this);
  }

  _validate() {
    const errors = [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(this._date)) {
      errors.push('date must be ISO YYYY-MM-DD');
    }
    if (!STATUSES.includes(this._status)) {
      errors.push(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (!this._modelUsed) {
      errors.push('modelUsed is required');
    }
    if (!this._promptVersion) {
      errors.push('promptVersion is required');
    }

    if (this._status === 'failed') {
      if (!this._errorMessage) {
        errors.push('errorMessage is required when status === "failed"');
      }
    } else if (this._status === 'completed') {
      if (!this._summary || this._summary.length < 20) {
        errors.push('summary is required (>= 20 chars) when status === "completed"');
      }
      if (!this._markdownBody || this._markdownBody.length < 200) {
        errors.push('markdownBody is required (>= 200 chars) when status === "completed"');
      }
    }

    for (const [field, value] of Object.entries({
      tokensIn: this._tokensIn,
      tokensOut: this._tokensOut,
      costUsd: this._costUsd,
      durationMs: this._durationMs,
    })) {
      if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        errors.push(`${field} must be a non-negative number`);
      }
    }

    if (this._riesgoPaisBp !== null && (Number.isNaN(this._riesgoPaisBp) || this._riesgoPaisBp < 0)) {
      errors.push('riesgoPaisBp, if present, must be a non-negative integer');
    }

    // Feature 006: light validation — present-but-malformed is rejected; absent is fine.
    if (this._portfolioTotals !== null) {
      for (const f of ['totalUsd', 'totalArs', 'grandTotalUsd', 'unrealizedPnlUsd', 'unrealizedPnlArs']) {
        const v = this._portfolioTotals[f];
        if (v !== undefined && (typeof v !== 'number' || Number.isNaN(v))) {
          errors.push(`portfolioTotals.${f}, if present, must be a number`);
        }
      }
    }
    if (this._positionChanges !== null) {
      for (const c of this._positionChanges) {
        if (!c || typeof c !== 'object' || !c.symbol || !['added', 'removed', 'increased', 'reduced'].includes(c.change)) {
          errors.push('each positionChange must have a symbol and change in added|removed|increased|reduced');
          break;
        }
      }
    }

    // Feature 010: light validation — present-but-malformed is rejected; absent
    // (null) and empty ([]) are both fine. Each entry must be a plain object.
    for (const [name, arr] of Object.entries({
      driftByBucket: this._driftByBucket,
      driftByAssetClass: this._driftByAssetClass,
      concentrationCaps: this._concentrationCaps,
      watchlist: this._watchlist,
      weekOverWeek: this._weekOverWeek,
      frameworkAmendments: this._frameworkAmendments,
      // Feature 012: same "present → array of objects, else reject" rule.
      macroChanges: this._macroChanges,
    })) {
      if (arr !== null) {
        for (const item of arr) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            errors.push(`each ${name} entry must be an object`);
            break;
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(
        errors.join('; '),
        errors.map((m) => ({ field: 'weeklyAnalysis', message: m }))
      );
    }
  }

  get date() { return this._date; }
  get status() { return this._status; }
  get generatedAt() { return this._generatedAt; }
  get modelUsed() { return this._modelUsed; }
  get promptVersion() { return this._promptVersion; }
  get summary() { return this._summary; }
  get markdownBody() { return this._markdownBody; }
  get riesgoPaisBp() { return this._riesgoPaisBp; }
  get riesgoPaisAsOf() { return this._riesgoPaisAsOf; }
  get portfolioSnapshot() { return this._portfolioSnapshot; }
  get tokensIn() { return this._tokensIn; }
  get tokensOut() { return this._tokensOut; }
  get costUsd() { return this._costUsd; }
  get durationMs() { return this._durationMs; }
  get errorMessage() { return this._errorMessage; }
  get instructionsHistoryRowKey() { return this._instructionsHistoryRowKey; }
  get frameworkHistoryRowKey() { return this._frameworkHistoryRowKey; }
  get macroContext() { return this._macroContext; }
  get portfolioTotals() { return this._portfolioTotals; }
  get positionChanges() { return this._positionChanges; }
  get driftByBucket() { return this._driftByBucket; }
  get driftByAssetClass() { return this._driftByAssetClass; }
  get concentrationCaps() { return this._concentrationCaps; }
  get watchlist() { return this._watchlist; }
  get weekOverWeek() { return this._weekOverWeek; }
  get frameworkAmendments() { return this._frameworkAmendments; }
  get macroChanges() { return this._macroChanges; }

  isCompleted() { return this._status === 'completed'; }
  isFailed() { return this._status === 'failed'; }

  /**
   * @returns {{ partitionKey: string, rowKey: string }}
   */
  static id(date) {
    return { partitionKey: 'weekly', rowKey: date };
  }

  toJSON() {
    return {
      date: this._date,
      status: this._status,
      generatedAt: this._generatedAt instanceof Date ? this._generatedAt.toISOString() : this._generatedAt,
      modelUsed: this._modelUsed,
      promptVersion: this._promptVersion,
      summary: this._summary,
      markdownBody: this._markdownBody,
      riesgoPaisBp: this._riesgoPaisBp,
      riesgoPaisAsOf: this._riesgoPaisAsOf,
      portfolioSnapshot: this._portfolioSnapshot,
      tokensIn: this._tokensIn,
      tokensOut: this._tokensOut,
      costUsd: this._costUsd,
      durationMs: this._durationMs,
      errorMessage: this._errorMessage,
      instructionsHistoryRowKey: this._instructionsHistoryRowKey,
      frameworkHistoryRowKey: this._frameworkHistoryRowKey,
      macroContext: this._macroContext,
      portfolioTotals: this._portfolioTotals,
      positionChanges: this._positionChanges,
      driftByBucket: this._driftByBucket,
      driftByAssetClass: this._driftByAssetClass,
      concentrationCaps: this._concentrationCaps,
      watchlist: this._watchlist,
      weekOverWeek: this._weekOverWeek,
      frameworkAmendments: this._frameworkAmendments,
      macroChanges: this._macroChanges,
    };
  }

  static fromJSON(data) {
    return new WeeklyAnalysis(data);
  }
}

module.exports = WeeklyAnalysis;
