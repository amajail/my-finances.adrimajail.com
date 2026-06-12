/**
 * IMF Status Provider (feature 006)
 *
 * Derives the IMF program review status for Argentina (FR-007) from the trailing
 * week's IMF news:
 *   1. Fetch the IMF global news RSS (public, no auth).
 *   2. Filter items from the last ~7 days mentioning "argentina".
 *   3. If matches → classify them into the status enum via a small AI call
 *      (FR-022; public news text only — never holdings).
 *   4. If no matches (quiet week) → carry forward the prior reading, reverting
 *      to "unknown" once it is older than `stalenessWeeks`.
 *   5. On fetch/classify FAILURE → carry forward the last known reading if any;
 *      otherwise throw ImfStatusFetchError (→ orchestrator marks unavailable).
 *
 * RSS is parsed with dependency-free tolerant string extraction.
 */

const IImfStatusProvider = require('../../application/interfaces/IImfStatusProvider');
const imfClassifyTool = require('../llm/imfClassifyTool');

const DEFAULT_URL = 'https://www.imf.org/en/news/rss';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_STALENESS_WEEKS = 8;
const LOOKBACK_DAYS = 7;
const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

class ImfStatusFetchError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.name = 'ImfStatusFetchError';
    if (cause) this.cause = cause;
  }
}

class ImfStatusProvider extends IImfStatusProvider {
  /**
   * @param {Object} deps
   * @param {Object}   deps.llmClient - ILLMClient with classify().
   * @param {Function} [deps.fetcher]
   * @param {string}   [deps.url]
   * @param {string}   [deps.model]
   * @param {number}   [deps.stalenessWeeks]
   * @param {number}   [deps.timeoutMs]
   * @param {Function} [deps.clock] - () => Date.
   */
  constructor({ llmClient, fetcher, url = DEFAULT_URL, model = DEFAULT_MODEL, stalenessWeeks = DEFAULT_STALENESS_WEEKS, timeoutMs = DEFAULT_TIMEOUT_MS, clock = () => new Date() } = {}) {
    super();
    this._llmClient = llmClient;
    this._fetcher = fetcher || (typeof fetch === 'function' ? fetch : null);
    this._url = url;
    this._model = model;
    this._stalenessWeeks = stalenessWeeks;
    this._timeoutMs = timeoutMs;
    this._clock = clock;
  }

  async getLatest({ priorReading = null } = {}) {
    try {
      const xml = await this._fetchRss();
      const items = this._parseItems(xml);
      const matches = this._filterRecentArgentina(items);

      if (matches.length === 0) {
        // Quiet week — carry forward (with staleness cap).
        return this._carryForward(priorReading);
      }

      const { result, usage } = await this._classify(matches);
      return { status: result.status, asOf: result.asOf, usage };
    } catch (err) {
      // Failure — carry the last known status forward regardless of staleness.
      if (priorReading && priorReading.value) {
        return { status: priorReading.value, asOf: priorReading.asOf || null, usage: { ...ZERO_USAGE } };
      }
      throw new ImfStatusFetchError(
        `IMF status unavailable and no prior reading to carry: ${err && err.message ? err.message : String(err)}`,
        err
      );
    }
  }

  _carryForward(priorReading) {
    if (priorReading && priorReading.value && priorReading.asOf && !this._isStale(priorReading.asOf)) {
      return { status: priorReading.value, asOf: priorReading.asOf, usage: { ...ZERO_USAGE } };
    }
    // Never known, or carried value is too old → unknown.
    return { status: 'unknown', asOf: null, usage: { ...ZERO_USAGE } };
  }

  _isStale(asOf) {
    const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
    if (!Number.isFinite(asOfMs)) return true;
    const ageDays = (this._clock().getTime() - asOfMs) / (1000 * 60 * 60 * 24);
    return ageDays > this._stalenessWeeks * 7;
  }

  async _fetchRss() {
    if (!this._fetcher) {
      throw new Error('no fetch implementation available (Node 18+ required, or pass fetcher in constructor)');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    let res;
    try {
      res = await this._fetcher(this._url, { signal: controller.signal });
    } catch (err) {
      throw new Error(
        err && err.name === 'AbortError'
          ? `timeout after ${this._timeoutMs}ms`
          : `fetch failed: ${err && err.message ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res || typeof res.ok !== 'boolean' || !res.ok) {
      throw new Error(`non-2xx response: ${res && res.status ? res.status : 'unknown'}`);
    }
    return res.text();
  }

  /**
   * Tolerant, dependency-free extraction of RSS <item> fields.
   * @private
   */
  _parseItems(xml) {
    const text = String(xml || '');
    const items = [];
    const itemRe = /<item[\s\S]*?<\/item>/gi;
    const blocks = text.match(itemRe) || [];
    for (const block of blocks) {
      items.push({
        title: this._tag(block, 'title'),
        link: this._tag(block, 'link'),
        description: this._tag(block, 'description'),
        pubDate: this._tag(block, 'pubDate'),
      });
    }
    return items;
  }

  _tag(block, name) {
    const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
    const m = block.match(re);
    if (!m) return '';
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  _filterRecentArgentina(items) {
    const cutoff = this._clock().getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    return items.filter((it) => {
      const hay = `${it.title} ${it.link} ${it.description}`.toLowerCase();
      if (!hay.includes('argentina')) return false;
      const ts = it.pubDate ? Date.parse(it.pubDate) : NaN;
      // If pubDate is missing/unparseable, keep it (better to classify than drop).
      return !Number.isFinite(ts) || ts >= cutoff;
    });
  }

  async _classify(matches) {
    const systemPrompt =
      'You classify the IMF program review status for Argentina based ONLY on the provided news snippets. ' +
      'Use the submit_imf_status tool. If the snippets do not clearly indicate a status, return "unknown".';
    const userMessage = [
      '## IMF/Argentina news (trailing week)',
      ...matches.map((m, i) => `${i + 1}. [${m.pubDate || 'undated'}] ${m.title}\n   ${m.description}`.trim()),
    ].join('\n');

    return this._llmClient.classify({
      systemPrompt,
      userMessage,
      toolSchema: imfClassifyTool,
      model: this._model,
      maxOutputTokens: 256,
    });
  }
}

module.exports = ImfStatusProvider;
module.exports.ImfStatusFetchError = ImfStatusFetchError;
