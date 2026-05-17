/**
 * GenerateWeeklyAnalysis Use Case
 *
 * The orchestrator for feature 002 (weekly rebalance analysis). Reads the
 * configured model / prompt-version / cost caps from settings; assembles the
 * inputs (current portfolio, prior week's analysis + snapshot, current
 * riesgo país); calls the LLM via ILLMClient; constructs a WeeklyAnalysis +
 * SuggestedOrder[] from the result; persists via IAnalysisRepository.
 *
 * Failure handling (US3 in spec):
 *   - Riesgo-país unreachable, cost cap exceeded, LLM SDK error, or LLM
 *     schema validation failure → persist a `failed` WeeklyAnalysis row with
 *     a sanitized errorMessage. The snapshot is included if the portfolio
 *     was already assembled before the failure.
 *
 * Reuses GetPortfolioSummary (feature 001) for the portfolio + MEP + price
 * inputs. NEVER logs the prompt body or response body (FR-026 / FR-029).
 */

const fs = require('fs');
const path = require('path');
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

const DEFAULTS = {
  model: 'claude-opus-4-7',
  promptVersion: 'weekly-rebalance-v1',
  maxInputTokens: 80000,
  maxOutputTokens: 8000,
};

class GenerateWeeklyAnalysis extends UseCase {
  /**
   * @param {Object} deps
   * @param {IAnalysisRepository} deps.analysisRepository
   * @param {ILLMClient}          deps.llmClient
   * @param {IRiesgoPaisProvider} deps.riesgoPaisProvider
   * @param {Object}              deps.getPortfolioSummary - GetPortfolioSummary use-case instance
   * @param {ISettingsRepository} deps.settingsRepository
   * @param {Function}            [deps.loadPrompt] - (version: string) => string (injectable for tests)
   * @param {Function}            [deps.clock]      - () => Date (injectable for tests)
   * @param {Object}              [deps.toolSchema] - override for tests
   */
  constructor({
    analysisRepository,
    llmClient,
    riesgoPaisProvider,
    getPortfolioSummary,
    settingsRepository,
    loadPrompt = null,
    clock = () => new Date(),
    toolSchema = TOOL_SCHEMA,
  }) {
    super();
    this._analysisRepository = analysisRepository;
    this._llmClient = llmClient;
    this._riesgoPaisProvider = riesgoPaisProvider;
    this._getPortfolioSummary = getPortfolioSummary;
    this._settingsRepository = settingsRepository;
    this._loadPrompt = loadPrompt || this._defaultLoadPrompt;
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

    // 1. Load settings (with defaults if missing).
    const [model, promptVersion, maxInputTokens, maxOutputTokens] = await Promise.all([
      this._getSetting('analysis.model', DEFAULTS.model),
      this._getSetting('analysis.promptVersion', DEFAULTS.promptVersion),
      this._getSettingNumber('analysis.maxInputTokens', DEFAULTS.maxInputTokens),
      this._getSettingNumber('analysis.maxOutputTokens', DEFAULTS.maxOutputTokens),
    ]);

    // Buffers we may need to persist even on failure paths.
    let portfolioSnapshot = [];
    let portfolioSummary = null;
    let riesgoReading = null;

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
            promptVersion,
            portfolioSnapshot,
            errorMessage: `riesgo-pais source unreachable: ${err.message}`,
          });
        }
        throw err;
      }

      // 4. Previous week's analysis (if any).
      const previousAnalysis = await this._loadPreviousAnalysis(targetDate);

      // 5. Strategic framework (the owner's personal content — bucket→symbol
      // mappings, targets, deploy priorities, standing directives). Lives in
      // settings, NOT in the prompt template file, so it never enters git.
      //
      // NOTE: AzureSettingsRepository.get(key) returns the raw value string
      // (or null), NOT a { value } wrapper. That wrapper shape only exists
      // at the API boundary via GetSetting.execute.
      const frameworkKey = `analysis.strategicFrameworkV1`;
      const frameworkValue = await this._readSettingRaw(frameworkKey);
      const strategicFramework = typeof frameworkValue === 'string'
        ? frameworkValue.trim()
        : '';
      if (!strategicFramework) {
        return await this._persistFailed({
          targetDate,
          startedAt,
          model,
          promptVersion,
          portfolioSnapshot,
          riesgoReading,
          errorMessage: `strategic framework not configured: set portfolioSettings row "${frameworkKey}" to your framework markdown (see scripts/seed-analysis-framework.example.md)`,
        });
      }

      // 6. Render the prompt: load the generic template and splice the framework.
      const systemPrompt = this._renderSystemPrompt(promptVersion, strategicFramework);
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
            promptVersion,
            portfolioSnapshot,
            riesgoReading,
            errorMessage: `cost cap exceeded: ${err.message}`,
          });
        }
        if (err instanceof LLMSchemaValidationError) {
          return await this._persistFailed({
            targetDate,
            startedAt,
            model,
            promptVersion,
            portfolioSnapshot,
            riesgoReading,
            errorMessage: `tool_use schema validation failed: ${err.message}`,
          });
        }
        if (err instanceof LLMRequestError) {
          const sanitized = err.sanitized || { message: err.message };
          return await this._persistFailed({
            targetDate,
            startedAt,
            model,
            promptVersion,
            portfolioSnapshot,
            riesgoReading,
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
          promptVersion,
          portfolioSnapshot,
          riesgoReading,
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
        promptVersion,
        summary: llmResult.summary,
        markdownBody: llmResult.markdownBody,
        riesgoPaisBp: riesgoReading.basisPoints,
        riesgoPaisAsOf: riesgoReading.asOf,
        portfolioSnapshot,
        tokensIn: llmResult.usage.inputTokens,
        tokensOut: llmResult.usage.outputTokens,
        costUsd: llmResult.usage.costUsd,
        durationMs: this._clock().getTime() - startedAt.getTime(),
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
        promptVersion,
        tokensIn: analysis.tokensIn,
        tokensOut: analysis.tokensOut,
        costUsd: analysis.costUsd,
        orderCount: orders.length,
        durationMs: analysis.durationMs,
        riesgoPaisBp: analysis.riesgoPaisBp,
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

  async _persistFailed({ targetDate, startedAt, model, promptVersion, portfolioSnapshot, riesgoReading, errorMessage }) {
    const failed = new WeeklyAnalysis({
      date: targetDate,
      status: 'failed',
      generatedAt: startedAt,
      modelUsed: model,
      promptVersion,
      portfolioSnapshot,
      riesgoPaisBp: riesgoReading ? riesgoReading.basisPoints : null,
      riesgoPaisAsOf: riesgoReading ? riesgoReading.asOf : null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: this._clock().getTime() - startedAt.getTime(),
      errorMessage,
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

  /**
   * Like _getSetting but returns the raw setting object (or null) without
   * falling back to a default. Used for the strategic framework, where a
   * missing value must surface as a `failed` run (not silently default).
   * @private
   */
  async _readSettingRaw(key) {
    try {
      return await this._settingsRepository.get(key);
    } catch (_) {
      return null;
    }
  }

  /**
   * Load the prompt template file and splice {{strategicFramework}} with the
   * owner's framework markdown (which lives in portfolioSettings, never in
   * the repo). Other slots like {{portfolioSummary}} are NOT substituted
   * here — those go into the userMessage, not the system prompt.
   * @private
   */
  _renderSystemPrompt(promptVersion, strategicFramework) {
    const template = this._loadPrompt(promptVersion);
    return template.replace(/\{\{strategicFramework\}\}/g, strategicFramework);
  }

  async _getSettingNumber(key, defaultValue) {
    const raw = await this._getSetting(key, String(defaultValue));
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : defaultValue;
  }

  _toIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  _defaultLoadPrompt(version) {
    const filePath = path.join(__dirname, 'prompts', `${version}.md`);
    return fs.readFileSync(filePath, 'utf8');
  }
}

module.exports = GenerateWeeklyAnalysis;
