/**
 * GenerateWeeklyAnalysis Use Case
 *
 * The orchestrator for the weekly rebalance analysis (feature 002, extended by
 * features 004 and 005). Reads the configured model / cost caps from settings;
 * assembles the inputs (current portfolio, prior week's analysis + snapshot,
 * current riesgo país); reads the active instructions document and uses it
 * VERBATIM as the AI system prompt (feature 005 — no template file, no token
 * substitution); calls the LLM via ILLMClient; constructs a WeeklyAnalysis +
 * SuggestedOrder[] from the result; persists via IAnalysisRepository.
 *
 * Failure handling (US3 in spec 002):
 *   - Riesgo-país unreachable, instructions not configured, cost cap exceeded,
 *     LLM SDK error, or LLM schema validation failure → persist a `failed`
 *     WeeklyAnalysis row with a sanitized errorMessage. The snapshot is
 *     included if the portfolio was already assembled before the failure.
 *
 * Reuses GetPortfolioSummary (feature 001) for the portfolio + MEP + price
 * inputs. NEVER logs the prompt body or response body (FR-026 / FR-029).
 */

const UseCase = require('../UseCase');
const WeeklyAnalysis = require('../../../domain/entities/WeeklyAnalysis');
const SuggestedOrder = require('../../../domain/entities/SuggestedOrder');
const PositionChangeCalculator = require('../../../domain/services/PositionChangeCalculator');
const AllocationDriftCalculator = require('../../../domain/services/AllocationDriftCalculator');
const { buildSystemPrompt } = require('./prompts/guardrails');
const logger = require('../../../shared/logging');
const {
  CostCapExceededError,
  LLMSchemaValidationError,
  LLMRequestError,
} = require('../../../infrastructure/llm/AnthropicLLMClient');

const TOOL_SCHEMA = require('../../../../specs/002-weekly-rebalance-analysis/contracts/submit-analysis-tool.json');

// Feature 005 retired the `analysis.promptVersion` template-file selector
// (FR-019). The instructions document is now the single source of the system
// prompt; analyses are traced by their instructions-version reference. This
// constant is stamped on every row purely to satisfy WeeklyAnalysis's required
// `promptVersion` field and to mark which prompt-assembly regime produced it.
// Feature 010 (FR-014): the effective prompt is now preamble ⊕ body; the marker
// records that the fixed guardrail preamble was applied for this run.
const INSTRUCTIONS_PROMPT_VERSION = 'editable-instructions-v1+guardrail-v1';

const DEFAULTS = {
  model: 'claude-opus-4-7',
  maxInputTokens: 80000,
  maxOutputTokens: 8000,
};

class GenerateWeeklyAnalysis extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAnalysisRepository}     deps.analysisRepository
   * @param {ILLMClient}              deps.llmClient
   * @param {IMacroContextProvider}   deps.macroContextProvider - Feature 006.
   *   Fans out to the 9 macro sources; resilient (riesgo país no longer fatal).
   * @param {Object}                  deps.getPortfolioSummary - GetPortfolioSummary use-case instance
   * @param {ISettingsRepository}     deps.settingsRepository
   * @param {IInstructionsRepository} deps.instructionsRepository - Feature 005.
   *   The active instructions document is read here (content + historyRowKey in
   *   a single call) and used VERBATIM as the system prompt. The historyRowKey
   *   is snapshotted at run start (FR-012) and stamped onto the analysis row so
   *   it links to the exact instructions version that produced it (FR-013).
   * @param {Function}                [deps.clock]      - () => Date (injectable for tests)
   * @param {Object}                  [deps.toolSchema] - override for tests
   */
  constructor({
    analysisRepository,
    llmClient,
    macroContextProvider,
    getPortfolioSummary,
    settingsRepository,
    instructionsRepository,
    allocationTargetsRepository = null,
    clock = () => new Date(),
    toolSchema = TOOL_SCHEMA,
  }) {
    super();
    this._analysisRepository = analysisRepository;
    this._llmClient = llmClient;
    // Feature 006: the macro orchestrator (riesgo país is now one of nine
    // indicators, and a source failure no longer aborts the run).
    this._macroContextProvider = macroContextProvider;
    this._getPortfolioSummary = getPortfolioSummary;
    this._settingsRepository = settingsRepository;
    this._instructionsRepository = instructionsRepository;
    // Feature 010: optional — when absent (or no targets row), the code-computed
    // drift/cap sections are simply omitted (FR-001a).
    this._allocationTargetsRepository = allocationTargetsRepository;
    this._clock = clock;
    this._toolSchema = toolSchema;
  }

  /**
   * @param {Object} [input]
   * @param {string} [input.targetDate] - ISO YYYY-MM-DD; defaults to today (in clock TZ).
   * @returns {Promise<WeeklyAnalysis>}
   */
  async execute(input = {}) {
    const startedAt = this._clock();
    const targetDate = input.targetDate || this._toIsoDate(startedAt);

    // 0. Freeze guard (feature 007, FR-004): if any order for this date has been
    //    marked with an execution status, the week is frozen — skip the run
    //    entirely (no LLM, no overwrite) and return the existing analysis so the
    //    recorded statuses are preserved. Normal weekly cadence is unaffected
    //    (each Friday is a new, unmarked date).
    try {
      if (await this._analysisRepository.hasMarkedOrders(targetDate)) {
        const existing = await this._analysisRepository.getByDate(targetDate);
        if (existing && existing.analysis) {
          logger.info('GenerateWeeklyAnalysis: skipped — week is frozen (orders marked)', {
            date: targetDate,
          });
          return existing.analysis;
        }
      }
    } catch (err) {
      // A guard failure must not block the run; fall through and proceed.
      logger.warn('GenerateWeeklyAnalysis: freeze-guard check failed; proceeding', {
        date: targetDate, errorType: err && err.name,
      });
    }

    // 1. Load settings (with defaults if missing). promptVersion is retired
    //    (feature 005, FR-019) — the instructions document is the system prompt.
    const [model, maxInputTokens, maxOutputTokens] = await Promise.all([
      this._getSetting('analysis.model', DEFAULTS.model),
      this._getSettingNumber('analysis.maxInputTokens', DEFAULTS.maxInputTokens),
      this._getSettingNumber('analysis.maxOutputTokens', DEFAULTS.maxOutputTokens),
    ]);

    // Buffers we may need to persist even on failure paths.
    let portfolioSnapshot = [];
    let portfolioSummary = null;
    // Feature 006 capture buffers — preserved on failure paths too (FR-014).
    let macroContext = null;
    let macroUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    let portfolioTotals = null;
    let positionChanges = null;
    let riesgoPaisBp = null;
    let riesgoPaisAsOf = null;
    // Feature 010 code-computed sections (null = targets unavailable → omitted).
    let driftByBucket = null;
    let driftByAssetClass = null;
    let concentrationCaps = null;
    // Feature 005: captured at the moment we read the instructions document,
    // then stamped onto every WeeklyAnalysis written by this run
    // (snapshot-at-start, FR-012).
    let instructionsHistoryRowKey = null;

    try {
      // 2. Current portfolio + run-time totals (Feature 006, FR-012/FR-013).
      portfolioSummary = await this._getPortfolioSummary.execute({});
      portfolioSnapshot = this._snapshotFromSummary(portfolioSummary);
      portfolioTotals = this._totalsFromSummary(portfolioSummary);

      // Feature 010: code-computed bucket / asset-class drift from the holdings
      // snapshot + machine-readable targets. Resilient — a missing targets row
      // or any read error leaves the sections null (omitted), never fatal
      // (FR-001a / Edge: targets unavailable).
      if (this._allocationTargetsRepository) {
        try {
          const targets = await this._allocationTargetsRepository.getActive();
          const drift = AllocationDriftCalculator.computeDrift(portfolioSnapshot, targets);
          if (drift) {
            driftByBucket = drift.driftByBucket;
            driftByAssetClass = drift.driftByAssetClass;
          }
          concentrationCaps = AllocationDriftCalculator.computeConcentrationCaps(portfolioSnapshot, targets);
        } catch (driftErr) {
          logger.warn('Allocation drift/cap computation failed; omitting code-computed sections', driftErr);
        }
      }

      // 3. Previous week's analysis (loaded before macro so we can thread the
      //    prior IMF reading for carry-forward and the prior snapshot for the
      //    position diff).
      const previousAnalysis = await this._loadPreviousAnalysis(targetDate);

      // 3b. Exact week-over-week position changes (Feature 006, FR-015..FR-017).
      //     null when there is no prior snapshot to diff (unknown / first run).
      const priorSnapshot = previousAnalysis && Array.isArray(previousAnalysis.portfolioSnapshot) && previousAnalysis.portfolioSnapshot.length > 0
        ? previousAnalysis.portfolioSnapshot
        : null;
      positionChanges = PositionChangeCalculator.diff(priorSnapshot, portfolioSnapshot);

      // 4. Macro context panel (Feature 006, FR-001..FR-011). Resilient: a
      //    failing source becomes available:false and the run proceeds — riesgo
      //    país included (no longer fatal).
      const priorImf = previousAnalysis && previousAnalysis.macroContext && previousAnalysis.macroContext.imfReviewStatus
        ? previousAnalysis.macroContext.imfReviewStatus
        : null;
      const priorImfReading = priorImf && priorImf.available
        ? { value: priorImf.value, asOf: priorImf.asOf }
        : null;
      const macroResult = await this._macroContextProvider.getLatest({ priorImfReading });
      macroContext = macroResult.readings;
      macroUsage = macroResult.usage || macroUsage;
      // Mirror riesgo país onto the legacy columns for backward compat (FR-011).
      const rp = macroContext.riesgoPais;
      riesgoPaisBp = rp && rp.available && typeof rp.value === 'number' ? rp.value : null;
      riesgoPaisAsOf = rp && rp.available ? rp.asOf : null;

      // 5. Active instructions document (feature 005). This is the COMPLETE AI
      //    system prompt — the former fixed instructions merged with the
      //    owner's framework — edited as one document and used verbatim. It
      //    lives in settings (never in git). We read content + historyRowKey in
      //    a single call so the resulting analysis row links to the exact
      //    instructions version that produced it (FR-012/FR-013).
      const active = await this._instructionsRepository.getActive();
      const instructionsContent = active && typeof active.content === 'string' ? active.content : '';
      instructionsHistoryRowKey = active ? (active.historyRowKey || null) : null;
      if (!instructionsContent.trim()) {
        return await this._persistFailed({
          targetDate,
          startedAt,
          model,
          portfolioSnapshot,
          macroContext,
          macroUsage,
          portfolioTotals,
          positionChanges,
          riesgoPaisBp,
          riesgoPaisAsOf,
          instructionsHistoryRowKey,
          errorMessage: 'instructions not configured: save an active instructions document in the dashboard (Instructions) before running the analysis',
        });
      }

      // 6. Assemble the prompt. Feature 010 (FR-014): the effective system
      //    prompt is the fixed guardrail preamble followed by the owner-edited
      //    instructions body (preamble ⊕ body). The body is still used verbatim;
      //    live data is delivered separately in the user message, unchanged.
      const systemPrompt = buildSystemPrompt(instructionsContent);
      const userMessage = this._buildUserMessage({
        generatedAt: startedAt.toISOString(),
        portfolioSummary,
        previousAnalysis,
        macroContext,
        portfolioTotals,
        positionChanges,
      });

      // 6. Call the LLM. The privacy boundary lives inside this method.
      let llmResult;
      try {
        llmResult = await this._llmClient.submitAnalysis({
          systemPrompt,
          userMessage,
          toolSchema: this._toolSchema,
          model,
          maxInputTokens,
          maxOutputTokens,
        });
      } catch (err) {
        // Feature 006: all capture buffers ride onto the failed row (FR-014).
        const captured = {
          targetDate, startedAt, model, portfolioSnapshot,
          macroContext, macroUsage, portfolioTotals, positionChanges,
          riesgoPaisBp, riesgoPaisAsOf, instructionsHistoryRowKey,
        };
        if (err instanceof CostCapExceededError) {
          return await this._persistFailed({ ...captured, errorMessage: `cost cap exceeded: ${err.message}` });
        }
        if (err instanceof LLMSchemaValidationError) {
          return await this._persistFailed({ ...captured, errorMessage: `tool_use schema validation failed: ${err.message}` });
        }
        if (err instanceof LLMRequestError) {
          const sanitized = err.sanitized || { message: err.message };
          return await this._persistFailed({ ...captured, errorMessage: `LLM request failed: ${sanitized.message}` });
        }
        // Unknown failure mode — persist failed, then re-throw for surface visibility.
        const errType = err && err.name ? err.name : 'Error';
        const errMsg = err && err.message ? err.message : String(err);
        await this._persistFailed({ ...captured, errorMessage: `unexpected error: ${errType}: ${errMsg}` });
        throw err;
      }

      // 7. Build domain entities from the structured result. Telemetry folds in
      //    the IMF classify call's usage (Feature 006, FR-022).
      const analysis = new WeeklyAnalysis({
        date: targetDate,
        status: 'completed',
        generatedAt: startedAt,
        modelUsed: model,
        promptVersion: INSTRUCTIONS_PROMPT_VERSION,
        summary: llmResult.summary,
        markdownBody: llmResult.markdownBody,
        riesgoPaisBp,
        riesgoPaisAsOf,
        portfolioSnapshot,
        macroContext,
        portfolioTotals,
        positionChanges,
        // Feature 010: code-computed sections (null when targets unavailable).
        driftByBucket,
        driftByAssetClass,
        concentrationCaps,
        // Feature 010: LLM-emitted sections (null when the model omitted them).
        watchlist: llmResult.watchlist || null,
        weekOverWeek: llmResult.weekOverWeek || null,
        frameworkAmendments: llmResult.frameworkAmendments || null,
        tokensIn: llmResult.usage.inputTokens + macroUsage.inputTokens,
        tokensOut: llmResult.usage.outputTokens + macroUsage.outputTokens,
        costUsd: Number((llmResult.usage.costUsd + macroUsage.costUsd).toFixed(4)),
        durationMs: this._clock().getTime() - startedAt.getTime(),
        instructionsHistoryRowKey,
      });

      const orders = (llmResult.orders || []).map((o, idx) => new SuggestedOrder({
        analysisDate: targetDate,
        index: idx,
        broker: o.broker,
        symbol: o.symbol,
        side: o.side,
        quantity: o.quantity,
        rationale: o.rationale,
        conviction: o.conviction,
      }));

      // 8. Persist.
      await this._analysisRepository.upsert(analysis, orders);

      // 9. Metadata-only log (no prompt, no response body).
      logger.info('GenerateWeeklyAnalysis: completed', {
        date: targetDate,
        model,
        tokensIn: analysis.tokensIn,
        tokensOut: analysis.tokensOut,
        costUsd: analysis.costUsd,
        orderCount: orders.length,
        durationMs: analysis.durationMs,
        riesgoPaisBp: analysis.riesgoPaisBp,
        instructionsHistoryRowKey,
      });

      return analysis;
    } catch (err) {
      logger.error('GenerateWeeklyAnalysis: unhandled failure', {
        date: targetDate,
        errorType: err && err.name ? err.name : 'Error',
      });
      throw err;
    }
  }

  // ==================== Helpers ====================

  async _persistFailed({
    targetDate, startedAt, model, portfolioSnapshot, errorMessage,
    instructionsHistoryRowKey = null,
    macroContext = null, macroUsage = null, portfolioTotals = null,
    positionChanges = null, riesgoPaisBp = null, riesgoPaisAsOf = null,
  }) {
    // Feature 006: whatever context was gathered before the failure is
    // preserved on the failed row (macro, totals, position changes) and the
    // IMF classify cost — if any — is still recorded (FR-014).
    const usage = macroUsage || { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const failed = new WeeklyAnalysis({
      date: targetDate,
      status: 'failed',
      generatedAt: startedAt,
      modelUsed: model,
      promptVersion: INSTRUCTIONS_PROMPT_VERSION,
      portfolioSnapshot,
      macroContext,
      portfolioTotals,
      positionChanges,
      riesgoPaisBp,
      riesgoPaisAsOf,
      tokensIn: usage.inputTokens || 0,
      tokensOut: usage.outputTokens || 0,
      costUsd: usage.costUsd || 0,
      durationMs: this._clock().getTime() - startedAt.getTime(),
      errorMessage,
      instructionsHistoryRowKey,
    });
    await this._analysisRepository.upsert(failed, []);
    logger.warn('GenerateWeeklyAnalysis: failed', {
      date: targetDate,
      model,
      errorMessage,
      durationMs: failed.durationMs,
    });
    return failed;
  }

  async _loadPreviousAnalysis(currentDate) {
    try {
      const recent = await this._analysisRepository.getLatest(5);
      const candidate = recent.find((a) => a.date < currentDate);
      if (!candidate) return null;
      const withOrders = await this._analysisRepository.getByDate(candidate.date);
      if (!withOrders) return null;
      return {
        date: withOrders.analysis.date,
        status: withOrders.analysis.status,
        summary: withOrders.analysis.summary,
        markdownBody: withOrders.analysis.markdownBody,
        portfolioSnapshot: withOrders.analysis.portfolioSnapshot,
        // Feature 006: prior macro panel for trend reasoning (FR-010) and the
        // prior IMF reading for carry-forward (FR-007). Null on pre-feature rows.
        macroContext: withOrders.analysis.macroContext || null,
        orders: withOrders.orders.map((o) => ({
          broker: o.broker,
          symbol: o.symbol,
          side: o.side,
          quantity: o.quantity,
          rationale: o.rationale,
          conviction: o.conviction,
          // Feature 007: tell the model what was actually done with each prior
          // suggestion (pending = not yet recorded) so it stops inferring (FR-009).
          executionStatus: o.executionStatus || 'pending',
        })),
      };
    } catch (err) {
      logger.warn('Could not load previous analysis; treating as first run', { errorType: err && err.name });
      return null;
    }
  }

  _snapshotFromSummary(summary) {
    if (!summary || !Array.isArray(summary.positions)) return [];
    return summary.positions
      .filter((p) => (p.status || 'open') !== 'closed')
      .map((p) => ({
        broker: p.brokerId,
        assetType: p.assetType,
        symbol: p.symbol,
        quantity: Number(p.quantity) || 0,
        averageCost: Number(p.averageCost) || 0,
        currentPrice: p.currentPrice !== undefined && p.currentPrice !== null ? Number(p.currentPrice) : null,
        currency: p.currency,
        valueUsd: Number(p.valueUsd) || 0,
      }));
  }

  _buildUserMessage({ generatedAt, portfolioSummary, previousAnalysis, macroContext, portfolioTotals, positionChanges }) {
    // The full per-position holdings list is delivered separately as an
    // authoritative `currentHoldings` block (below), so it is pulled out of the
    // portfolioSummary aggregates to avoid duplicating it in the prompt.
    const holdings = (portfolioSummary && Array.isArray(portfolioSummary.positions))
      ? portfolioSummary.positions
      : null;
    // Feature 011 (FR-002): also strip topPerformers/bottomPerformers from the
    // prompt copy — they are derivable from currentHoldings and pure token
    // overhead. PortfolioCalculator.summary() is unchanged, so the dashboard
    // still receives them (FR-011). To restore them in the prompt, drop
    // `topPerformers`/`bottomPerformers` from this destructured omit-list.
    const summaryForPrompt = portfolioSummary
      ? (() => {
          const { positions, topPerformers, bottomPerformers, ...rest } = portfolioSummary;
          return rest;
        })()
      : portfolioSummary;
    // The prior week's full narrative (markdownBody) and snapshot are NOT fed
    // back into the prompt: the narrative is a contamination vector (any
    // instrument the model once mentioned gets carried forward indefinitely,
    // even if never held), and the snapshot is redundant with currentHoldings +
    // positionChanges. We keep the prior summary, orders and macro panel so the
    // model still has week-over-week continuity (FR-010).
    const previousForPrompt = previousAnalysis
      ? (() => { const { markdownBody, portfolioSnapshot, ...rest } = previousAnalysis; return rest; })()
      : previousAnalysis;
    const parts = [
      '## generatedAt',
      generatedAt,
      '',
      // Authoritative, complete list of every open position. The model must
      // treat this as ground truth: do NOT reference, hold, or review any
      // instrument that is not in this list (prevents carried-forward
      // hallucinations from the prior narrative).
      '## currentHoldings',
      'These are ALL of the open positions currently held. This is the complete and authoritative holdings list — do not reference, recommend holding, or flag for review any instrument that does not appear here.',
    ];
    // Feature 011 (FR-001): compact JSON (no 2-space indent) throughout — the
    // pretty-print whitespace was pure token overhead the model does not need.
    if (holdings) {
      parts.push('```json', JSON.stringify(holdings), '```');
    } else {
      parts.push('unavailable');
    }
    parts.push(
      '',
      '## portfolioSummary',
      '```json',
      JSON.stringify(summaryForPrompt),
      '```',
      '',
      // Feature 011 (FR-002): the former `## portfolioTotals` block duplicated
      // portfolioSummary (totals by currency, grand total, unrealized P&L, cost
      // basis); the only unique datum is the MEP rate, kept as a one-liner.
      // portfolioTotals is still computed + persisted on the WeeklyAnalysis and
      // shown on the dashboard (FR-011) — only this prompt block is removed.
      '## mepRate',
      portfolioTotals && portfolioTotals.mepRate != null
        ? `${portfolioTotals.mepRate}${portfolioTotals.mepRateAsOf ? ` (as of ${portfolioTotals.mepRateAsOf})` : ''}`
        : 'unavailable',
      '',
      // Feature 006: precomputed week-over-week position changes. null = unknown
      // (no prior snapshot); [] = no changes; otherwise the exact deltas.
      '## positionChanges'
    );
    if (positionChanges === null) {
      parts.push('unknown — no prior snapshot to compare');
    } else if (positionChanges.length === 0) {
      parts.push('none — no positions changed this week');
    } else {
      parts.push('```json', JSON.stringify(positionChanges), '```');
    }
    // The previousAnalysis block carries the prior macro panel (when present),
    // so the model can reason about week-over-week direction (FR-010).
    parts.push('', '## previousAnalysis');
    if (previousForPrompt) {
      parts.push('```json', JSON.stringify(previousForPrompt), '```');
    } else {
      parts.push('none — first run');
    }
    parts.push('', '## macroContext');
    if (macroContext) {
      parts.push('```json', JSON.stringify(macroContext), '```');
    } else {
      parts.push('unavailable');
    }
    return parts.join('\n');
  }

  /**
   * Map the portfolio summary's aggregates onto the persisted PortfolioTotals
   * shape (Feature 006, FR-012). Captured once per run, never recomputed.
   * @private
   */
  _totalsFromSummary(summary) {
    if (!summary) return null;
    const byCur = summary.totalByCurrency || {};
    const pnl = summary.unrealizedPnlByCurrency || {};
    const cost = summary.costBasisByCurrency || {};
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return {
      totalUsd: num(byCur.USD),
      totalArs: num(byCur.ARS),
      grandTotalUsd: num(summary.grandTotalUsd),
      unrealizedPnlUsd: num(pnl.USD),
      unrealizedPnlArs: num(pnl.ARS),
      costBasisUsd: num(cost.USD),
      costBasisArs: num(cost.ARS),
      mepRate: num(summary.mepRate),
      mepRateAsOf: summary.mepRateAsOf || null,
    };
  }

  async _getSetting(key, defaultValue) {
    // AzureSettingsRepository.get returns the raw value string (or null) —
    // no { value } wrapper at the repository boundary.
    try {
      const value = await this._settingsRepository.get(key);
      if (value !== null && value !== undefined && value !== '') return value;
    } catch (_) { /* fallthrough to default */ }
    return defaultValue;
  }

  async _getSettingNumber(key, defaultValue) {
    const raw = await this._getSetting(key, String(defaultValue));
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : defaultValue;
  }

  _toIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }
}

module.exports = GenerateWeeklyAnalysis;
