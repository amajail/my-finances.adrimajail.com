/**
 * ImfStatusProvider tests (feature 006, FR-007/FR-022).
 *   - Argentina news in window → AI classify
 *   - quiet week → carry forward (with staleness cap → unknown)
 *   - failure → carry forward if prior exists, else throw
 *   - only public news text is sent to classify (no holdings)
 */

const ImfStatusProvider = require('../../../../src/infrastructure/providers/ImfStatusProvider');
const { ImfStatusFetchError } = ImfStatusProvider;

const NOW = new Date('2026-06-12T00:00:00Z');
const clock = () => NOW;

function rss(items) {
  const body = items.map((it) => `
    <item>
      <title>${it.title}</title>
      <link>${it.link || 'https://www.imf.org/en/news/x'}</link>
      <description>${it.description || ''}</description>
      <pubDate>${it.pubDate}</pubDate>
    </item>`).join('');
  return `<?xml version="1.0"?><rss><channel>${body}</channel></rss>`;
}

function xmlFetcher(text, { ok = true } = {}) {
  return jest.fn(async () => ({ ok, status: ok ? 200 : 500, text: async () => text }));
}

function classifyMock(result = { status: 'approved', asOf: '2026-06-10' }) {
  return jest.fn(async () => ({ result, usage: { inputTokens: 120, outputTokens: 12, costUsd: 0.0002 } }));
}

describe('ImfStatusProvider', () => {
  it('classifies when there is Argentina news in the trailing week', async () => {
    const classify = classifyMock();
    const fetcher = xmlFetcher(rss([
      { title: 'IMF Completes Second Review for Argentina', description: 'Board approved.', pubDate: 'Wed, 10 Jun 2026 12:00:00 GMT' },
      { title: 'IMF and Some Other Country', description: 'unrelated', pubDate: 'Wed, 10 Jun 2026 12:00:00 GMT' },
    ]));
    const provider = new ImfStatusProvider({ llmClient: { classify }, fetcher, clock });

    const r = await provider.getLatest({ priorReading: null });
    expect(r.status).toBe('approved');
    expect(r.usage.costUsd).toBeCloseTo(0.0002, 4);
    expect(classify).toHaveBeenCalledTimes(1);
    // Only public news text is sent — no holdings.
    const sent = classify.mock.calls[0][0].userMessage;
    expect(sent).toContain('Argentina');
    expect(sent).not.toMatch(/quantity|averageCost|valueUsd/);
  });

  it('carries the prior reading forward on a quiet week (no Argentina news)', async () => {
    const classify = classifyMock();
    const fetcher = xmlFetcher(rss([
      { title: 'IMF and Some Other Country', description: 'unrelated', pubDate: 'Wed, 10 Jun 2026 12:00:00 GMT' },
    ]));
    const provider = new ImfStatusProvider({ llmClient: { classify }, fetcher, clock });

    const r = await provider.getLatest({ priorReading: { value: 'approved', asOf: '2026-05-21' } });
    expect(r.status).toBe('approved');
    expect(r.asOf).toBe('2026-05-21');
    expect(classify).not.toHaveBeenCalled();
  });

  it('reverts to unknown when the carried reading is older than the staleness cap', async () => {
    const fetcher = xmlFetcher(rss([])); // no items at all
    const provider = new ImfStatusProvider({ llmClient: { classify: classifyMock() }, fetcher, clock, stalenessWeeks: 8 });

    // asOf ~ 10 weeks before NOW.
    const r = await provider.getLatest({ priorReading: { value: 'approved', asOf: '2026-04-01' } });
    expect(r.status).toBe('unknown');
  });

  it('carries forward on fetch failure when a prior reading exists', async () => {
    const provider = new ImfStatusProvider({ llmClient: { classify: classifyMock() }, fetcher: xmlFetcher('', { ok: false }), clock });
    const r = await provider.getLatest({ priorReading: { value: 'pending', asOf: '2026-06-01' } });
    expect(r.status).toBe('pending');
  });

  it('throws ImfStatusFetchError on failure with no prior reading to carry', async () => {
    const provider = new ImfStatusProvider({ llmClient: { classify: classifyMock() }, fetcher: xmlFetcher('', { ok: false }), clock });
    await expect(provider.getLatest({ priorReading: null })).rejects.toBeInstanceOf(ImfStatusFetchError);
  });
});
