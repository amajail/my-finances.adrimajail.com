/**
 * WebSearchImfStatusProvider tests (feature 006, FR-007/FR-022).
 *   - researches via the AI web-search classify call and returns {status, asOf}
 *   - sends only a public question (no holdings) and forces web_search use
 *   - on failure: carry forward prior reading, else throw
 */

const WebSearchImfStatusProvider = require('../../../../src/infrastructure/providers/WebSearchImfStatusProvider');
const { ImfStatusFetchError } = WebSearchImfStatusProvider;

describe('WebSearchImfStatusProvider', () => {
  it('returns the classified status and aggregates usage', async () => {
    const classifyWithWebSearch = jest.fn().mockResolvedValue({
      result: { status: 'approved', asOf: '2026-05-21' },
      usage: { inputTokens: 800, outputTokens: 40, costUsd: 0.0009 },
    });
    const provider = new WebSearchImfStatusProvider({ llmClient: { classifyWithWebSearch } });

    const r = await provider.getLatest({ priorReading: null });
    expect(r).toMatchObject({ status: 'approved', asOf: '2026-05-21' });
    expect(r.usage.costUsd).toBeCloseTo(0.0009, 4);

    // Only a public question is sent — no holdings.
    const sent = classifyWithWebSearch.mock.calls[0][0];
    expect(sent.userMessage.toLowerCase()).toContain('imf');
    expect(JSON.stringify(sent)).not.toMatch(/quantity|averageCost|valueUsd|portfolio/i);
  });

  it('carries the prior reading forward when the AI call fails', async () => {
    const classifyWithWebSearch = jest.fn().mockRejectedValue(new Error('search unavailable'));
    const provider = new WebSearchImfStatusProvider({ llmClient: { classifyWithWebSearch } });

    const r = await provider.getLatest({ priorReading: { value: 'pending', asOf: '2026-04-15' } });
    expect(r).toMatchObject({ status: 'pending', asOf: '2026-04-15' });
  });

  it('throws ImfStatusFetchError when the call fails and there is no prior reading', async () => {
    const classifyWithWebSearch = jest.fn().mockRejectedValue(new Error('search unavailable'));
    const provider = new WebSearchImfStatusProvider({ llmClient: { classifyWithWebSearch } });

    await expect(provider.getLatest({ priorReading: null })).rejects.toBeInstanceOf(ImfStatusFetchError);
  });
});
