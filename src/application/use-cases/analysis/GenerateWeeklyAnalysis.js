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
const logger = require('../../../shared/logging');
const { RiesgoPaisFetchError } = require('../../../infrastructure/providers/ArgentinaDatosRiesgoPaisProvider');
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
const INSTRUCTIONS_PROMPT_VERSION = 'editable-instructions-v1';

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
   * @param {IRiesgoPaisProvider}     deps.riesgoPaisProvider
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
    riesgoPaisProvider,
    getPortfolioSummary,
    settingsRepository,
    instructionsRepository,
    clock = () => new Date(),
    toolSchema = TOOL_SCHEMA,
  }) {
    super();
    this._analysisRepository = analysisRepository;
    this._llmClient = llmClient;
    this._riesgoPaisProvider = riesgoPaisProvider;
    this._getPortfolioSummary = getPortfolioSummary;
    this._settingsRepository = settingsRepository;
    this._instructionsRepository = instructionsRepository;
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
    let riesgoReading = null;
    // Feature 005: captured at the moment we read the instructions document,
    // then stamped onto every WeeklyAnalysis written by this run
    // (snapshot-at-start, FR-012).
    let instructionsHistoryRowKey = null;

    try {
      // 2. Current portfolio.
      portfolioSummary = await this._getPortfolioSummary.execute({});
      portfolioSnapshot = this._snapshotFromSummary(portfolioSummary);

      // 3. Riesgo país (failure here aborts the run with a failed row).
      try {
        riesgoReading = await this._riesgoPaisProvider.getLatest();
      } catch (err) {
        if (err instanceof RiesgoPaisFetchError) {
          return await this._persistFailed({
            targetDate,
            startedAt,
            model,
            portfolioSnapshot,
            errorMessage: `riesgo-pais source unreachable: ${err.message}`,
          });
        }
        throw err;
      }

      // 4. Previous week's analysis (if any).
      const previousAnalysis = await this._loadPreviousAnalysis(targetDate);

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
          riesgoReading,
          instructionsHistoryRowKey,
          errorMessage: 'instructions not configured: save an active instructions document in the dashboard (Instructions) before running the analysis',
        });
      }

      // 6. Assemble the prompt. The instructions document IS the system prompt
      //    verbatim — no token substitution (FR-003, FR-004). Live data is
      //    delivered separately in the user message, unchanged.
      const systemPrompt = instructionsContent;
      const userMessage = this._buildUserMessage({
        generatedAt: startedAt.toISOString(),
        portfolioSummary,
        previousAnalysis,
        riesgoPais: riesgoReading,
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
        if (err instanceof CostCapExceededError) {
          return await this._persistFailed({
            targetDate,
            startedAt,
            model,
            portfolioSnapshot,
            riesgoReading,
            instructionsHistoryRowKey,
            errorMessage: `cost cap exceeded: ${err.message}`,
          });
        }
        if (err instanceof LLMSchemaValidationError) {
          return await this._persistFailed({
            targetDate,
            startedAt,
            model,
            portfolioSnapshot,
            riesgoReading,
            instructionsHistoryRowKey,
            errorMessage: `tool_use schema validation failed: ${err.message}`,
          });
        }
        if (err instanceof LLMRequestError) {
          const sanitized = err.sanitized || { message: err.message };
          return await this._persistFailed({
            targetDate,
            startedAt,
            model,
            portfolioSnapshot,
            riesgoReading,
            instructionsHistoryRowKey,
            errorMessage: `LLM request failed: ${sanitized.message}`,
          });
        }
        // Unknown failure mode — persist failed, then re-throw for surface visibility.
        const errType = err && err.name ? err.name : 'Error';
        const errMsg = err && err.message ? err.message : String(err);
        await this._persistFailed({
          targetDate,
          startedAt,
          model,
          portfolioSnapshot,
          riesgoReading,
          instructionsHistoryRowKey,
          errorMessage: `unexpected error: ${errType}: ${errMsg}`,
        });
        throw err;
      }

      // 7. Build domain entities from the structured result.
      const analysis = new WeeklyAnalysis({
        date: targetDate,
        status: 'completed',
        generatedAt: startedAt,
        modelUsed: model,
        promptVersion: INSTRUCTIONS_PROMPT_VERSION,
        summary: llmResult.summary,
        markdownBody: llmResult.markdownBody,
        riesgoPaisBp: riesgoReading.basisPoints,
        riesgoPaisAsOf: riesgoReading.asOf,
        portfolioSnapshot,
        tokensIn: llmResult.usage.inputTokens,
        tokensOut: llmResult.usage.outputTokens,
        costUsd: llmResult.usage.costUsd,
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

  async _persistFailed({ targetDate, startedAt, model, portfolioSnapshot, riesgoReading, errorMessage, instructionsHistoryRowKey = null }) {
    const failed = new WeeklyAnalysis({
      date: targetDate,
      status: 'failed',
      generatedAt: startedAt,
      modelUsed: model,
      promptVersion: INSTRUCTIONS_PROMPT_VERSION,
      portfolioSnapshot,
      riesgoPaisBp: riesgoReading ? riesgoReading.basisPoints : null,
      riesgoPaisAsOf: riesgoReading ? riesgoReading.asOf : null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
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
        orders: withOrders.orders.map((o) => ({
          broker: o.broker,
          symbol: o.symbol,
          side: o.side,
          quantity: o.quantity,
          rationale: o.rationale,
          conviction: o.conviction,
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

  _buildUserMessage({ generatedAt, portfolioSummary, previousAnalysis, riesgoPais }) {
    const parts = [
      '## generatedAt',
      generatedAt,
      '',
      '## portfolioSummary',
      '```json',
      JSON.stringify(portfolioSummary, null, 2),
      '```',
      '',
      '## previousAnalysis',
    ];
    if (previousAnalysis) {
      parts.push('```json', JSON.stringify(previousAnalysis, null, 2), '```');
    } else {
      parts.push('none — first run');
    }
    parts.push('', '## riesgoPais');
    if (riesgoPais) {
      parts.push('```json', JSON.stringify(riesgoPais), '```');
    } else {
      parts.push('unavailable');
    }
    return parts.join('\n');
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
