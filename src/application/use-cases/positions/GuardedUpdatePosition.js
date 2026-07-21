/**
 * GuardedUpdatePosition Use Case (feature 018)
 *
 * MCP-path wrapper around UpdatePosition. Adds the agent-facing guardrails
 * WITHOUT changing the dashboard PUT path's semantics:
 *
 *  - Null-preserves (FR-002): keys sent as null/undefined are stripped before
 *    the merge, so an explicit `averageCost: null` keeps the stored PPC
 *    (plain UpdatePosition would feed null into the Position constructor and
 *    throw). Only the conversational-maintenance subset of fields is exposed.
 *  - Quantity-change guardrail (FR-004): changes beyond the configured
 *    relative threshold — or any reduction to zero — are rejected unless the
 *    caller passes `confirm: true`. The threshold comes from the
 *    `mcpQuantityChangeThresholdPct` portfolioSettings row; absent or invalid
 *    values fall back to a conservative 50% (the guardrail never switches off).
 *
 * Delegates to UpdatePosition for the actual merge + domain validation +
 * persistence + audit, so the agent path can never persist anything the
 * dashboard path would reject (FR-003).
 */

const UseCase = require('../UseCase');
const QuantityChangeGuard = require('../../../domain/services/QuantityChangeGuard');
const logger = require('../../../shared/logging');
const { NotFoundError, DomainError } = require('../../../shared/errors');

// Conversational-maintenance subset (spec FR-002). Fields like currentPrice or
// realizedPnl stay system-managed and are deliberately NOT exposed to agents.
const PATCHABLE_FIELDS = ['quantity', 'averageCost', 'notes', 'status', 'maturityDate'];

const THRESHOLD_SETTING_KEY = 'mcpQuantityChangeThresholdPct';
const DEFAULT_THRESHOLD_PCT = 50;

class GuardedUpdatePosition extends UseCase {
  /**
   * @param {Object} deps
   * @param {UpdatePosition} deps.updatePosition - The shared update use case (with audit wired).
   * @param {IPositionRepository} deps.positionRepository
   * @param {ISettingsRepository} deps.settingsRepository
   */
  constructor({ updatePosition, positionRepository, settingsRepository }) {
    super();
    this._updatePosition = updatePosition;
    this._positionRepository = positionRepository;
    this._settingsRepository = settingsRepository;
  }

  /**
   * @param {Object} input - { brokerId, rowKey, confirm?, ...patch }
   * @returns {Promise<Object>} Updated position as plain object
   */
  async execute(input) {
    this.validateInput(input);

    // FR-002: strip null/undefined keys — absence (however serialized) always
    // preserves the stored value.
    const patch = {};
    for (const field of PATCHABLE_FIELDS) {
      if (input[field] !== undefined && input[field] !== null) {
        patch[field] = input[field];
      }
    }
    const confirm = input.confirm === true;

    if ('quantity' in patch) {
      const existing = await this._positionRepository.findById(input.brokerId, input.rowKey);
      if (!existing) {
        throw new NotFoundError('Position', `${input.brokerId}/${input.rowKey}`);
      }
      const oldQuantity = existing.toJSON().quantity;
      const newQuantity = Number(patch.quantity);
      const thresholdPct = await this._getThresholdPct();
      const { exceeds, changePct } = QuantityChangeGuard.evaluate(oldQuantity, newQuantity, thresholdPct);

      if (exceeds && !confirm) {
        const magnitude = changePct != null
          ? `a ${Math.round(changePct * 10) / 10}% change`
          : 'a change from/to zero (always over threshold)';
        throw new DomainError(
          `Quantity change from ${oldQuantity} to ${newQuantity} is ${magnitude}, ` +
          `which exceeds the ${thresholdPct}% confirmation threshold. ` +
          `If this is intentional, retry with confirm: true.`
        );
      }
    }

    return this._updatePosition.execute({
      brokerId: input.brokerId,
      rowKey: input.rowKey,
      ...patch,
      _audit: { source: 'mcp', confirmationUsed: confirm },
    });
  }

  /**
   * Read the threshold setting; fall back to the conservative default on any
   * absent, unparseable, or out-of-range value — the guardrail never turns off.
   * @returns {Promise<number>}
   */
  async _getThresholdPct() {
    try {
      const raw = await this._settingsRepository.get(THRESHOLD_SETTING_KEY);
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
        return parsed;
      }
    } catch (err) {
      logger.warn('GuardedUpdatePosition: threshold setting read failed, using default', { error: err.message });
    }
    return DEFAULT_THRESHOLD_PCT;
  }
}

module.exports = GuardedUpdatePosition;
module.exports.THRESHOLD_SETTING_KEY = THRESHOLD_SETTING_KEY;
module.exports.DEFAULT_THRESHOLD_PCT = DEFAULT_THRESHOLD_PCT;
