/**
 * SuggestedOrder Entity
 *
 * One row per buy/sell suggestion produced by a weekly analysis run.
 * Owned by (associated with) the parent WeeklyAnalysis via `analysisDate`.
 *
 * Immutable: the LLM emits these, the system persists them, the dashboard
 * renders them read-only. No per-order status is tracked — per Clarification
 * Q1 the owner records execution by updating the portfolio itself, and next
 * week's analysis infers what was acted on from the snapshot delta.
 *
 * `side` enum is `buy | sell` only. Per Clarification Q5, hold-style
 * commentary on individual positions lives in the parent narrative body, not
 * here as a row.
 *
 * Feature: 002-weekly-rebalance-analysis (spec FR-008 + FR-020).
 */

const { ValidationError } = require('../../shared/errors');

const SIDES = ['buy', 'sell'];
const CONVICTIONS = ['low', 'medium', 'high'];
const KNOWN_BROKERS = ['galicia', 'iol', 'ibkr', 'bullmarket', 'cash'];
// Feature 007: owner-set execution outcome for a suggestion. Default 'pending'.
const EXECUTION_STATUSES = ['pending', 'executed', 'partial', 'skipped'];
const NOTE_MAX = 500;

class SuggestedOrder {
  /**
   * @param {Object} data
   * @param {string} data.analysisDate - ISO YYYY-MM-DD of the parent run.
   * @param {number} data.index - 0-based position in the parent's orders array.
   * @param {string} data.broker - One of the known broker ids.
   * @param {string} data.symbol - Instrument symbol (e.g. 'BRK.B', 'GD41D').
   * @param {string} data.side - 'buy' | 'sell'.
   * @param {number} data.quantity - Positive.
   * @param {string} data.rationale - >= 20 chars.
   * @param {string} data.conviction - 'low' | 'medium' | 'high'.
   */
  constructor(data) {
    this._analysisDate = String(data.analysisDate || '').trim();
    this._index = Number.isFinite(Number(data.index)) ? parseInt(data.index, 10) : NaN;
    this._broker = String(data.broker || '').trim();
    this._symbol = String(data.symbol || '').trim();
    this._side = String(data.side || '').trim();
    this._quantity = data.quantity !== undefined && data.quantity !== null
      ? Number(data.quantity)
      : NaN;
    this._rationale = String(data.rationale || '');
    this._conviction = String(data.conviction || '').trim();
    // Feature 007: execution tracking. Optional; default 'pending'.
    this._executionStatus = data.executionStatus
      ? String(data.executionStatus).trim()
      : 'pending';
    this._executionNote = data.executionNote !== undefined && data.executionNote !== null
      ? String(data.executionNote)
      : null;
    this._executionUpdatedAt = data.executionUpdatedAt || null;
    // Feature 018: optional owner-reported execution price. Stored for future
    // outcome-P&L scoring (roadmap P3-2); not consumed by the scorecard yet.
    this._executionPrice = data.executionPrice !== undefined && data.executionPrice !== null
      ? Number(data.executionPrice)
      : null;

    this._validate();
    Object.freeze(this);
  }

  _validate() {
    const errors = [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(this._analysisDate)) {
      errors.push('analysisDate must be ISO YYYY-MM-DD');
    }
    if (!Number.isInteger(this._index) || this._index < 0) {
      errors.push('index must be a non-negative integer');
    }
    if (!KNOWN_BROKERS.includes(this._broker)) {
      errors.push(`broker must be one of: ${KNOWN_BROKERS.join(', ')}`);
    }
    if (!this._symbol) {
      errors.push('symbol is required');
    }
    if (!SIDES.includes(this._side)) {
      errors.push(`side must be one of: ${SIDES.join(', ')} (hold is not a valid order side; hold commentary belongs in the narrative)`);
    }
    if (!Number.isFinite(this._quantity) || this._quantity <= 0) {
      errors.push('quantity must be a positive number');
    }
    if (!this._rationale || this._rationale.length < 20) {
      errors.push('rationale is required and must be at least 20 characters');
    }
    if (!CONVICTIONS.includes(this._conviction)) {
      errors.push(`conviction must be one of: ${CONVICTIONS.join(', ')}`);
    }
    if (!EXECUTION_STATUSES.includes(this._executionStatus)) {
      errors.push(`executionStatus must be one of: ${EXECUTION_STATUSES.join(', ')}`);
    }
    if (this._executionNote !== null && this._executionNote.length > NOTE_MAX) {
      errors.push(`executionNote must be at most ${NOTE_MAX} characters`);
    }
    if (this._executionPrice !== null && (!Number.isFinite(this._executionPrice) || this._executionPrice <= 0)) {
      errors.push('executionPrice must be a positive number when provided');
    }

    if (errors.length > 0) {
      throw new ValidationError(
        errors.join('; '),
        errors.map((m) => ({ field: 'suggestedOrder', message: m }))
      );
    }
  }

  get analysisDate() { return this._analysisDate; }
  get index() { return this._index; }
  get broker() { return this._broker; }
  get symbol() { return this._symbol; }
  get side() { return this._side; }
  get quantity() { return this._quantity; }
  get rationale() { return this._rationale; }
  get conviction() { return this._conviction; }
  get executionStatus() { return this._executionStatus; }
  get executionNote() { return this._executionNote; }
  get executionUpdatedAt() { return this._executionUpdatedAt; }
  get executionPrice() { return this._executionPrice; }
  isMarked() { return this._executionStatus !== 'pending'; }

  /**
   * @returns {{ partitionKey: string, rowKey: string }}
   */
  static id(analysisDate, index) {
    return {
      partitionKey: analysisDate,
      rowKey: String(index).padStart(2, '0'),
    };
  }

  toJSON() {
    return {
      analysisDate: this._analysisDate,
      index: this._index,
      broker: this._broker,
      symbol: this._symbol,
      side: this._side,
      quantity: this._quantity,
      rationale: this._rationale,
      conviction: this._conviction,
      executionStatus: this._executionStatus,
      executionNote: this._executionNote,
      executionUpdatedAt: this._executionUpdatedAt,
      executionPrice: this._executionPrice,
    };
  }

  static fromJSON(data) {
    return new SuggestedOrder(data);
  }
}

module.exports = SuggestedOrder;
module.exports.EXECUTION_STATUSES = EXECUTION_STATUSES;
