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

    this._validate();
    Object.freeze(this._portfolioSnapshot);
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
    };
  }

  static fromJSON(data) {
    return new WeeklyAnalysis(data);
  }
}

module.exports = WeeklyAnalysis;
