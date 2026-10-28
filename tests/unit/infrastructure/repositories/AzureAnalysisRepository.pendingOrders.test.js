/**
 * AzureAnalysisRepository — feature 020 `ageWeeks` (order row) and
 * `confirmationItemsJson` (analysis row) mapping. Pure mappers.
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const WeeklyAnalysis = require('../../../../src/domain/entities/WeeklyAnalysis');
const SuggestedOrder = require('../../../../src/domain/entities/SuggestedOrder');

const repo = new AzureAnalysisRepository({});

const base = (over = {}) => new WeeklyAnalysis({
  date: '2026-06-20', status: 'completed', generatedAt: '2026-06-20T21:00:00Z',
  modelUsed: 'claude-opus-4-8', promptVersion: 'editable-instructions-v1+guardrail-v2',
  summary: 'A sufficiently long executive summary for validation purposes here.',
  markdownBody: 'x'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
  ...over,
});

const ITEM = {
  broker: 'BROKER', symbol: 'SYMBOL', side: 'buy', quantity: 5, ageWeeks: 3, originDate: '2026-06-06',
  lastDate: '2026-06-13', lastIndex: 0, reason: 'stale', proposedStatus: null,
};

const order = (over = {}) => new SuggestedOrder({
  analysisDate: '2026-06-20', index: 0, broker: 'ibkr', symbol: 'SYMBOL', side: 'buy', quantity: 5,
  rationale: 'Placeholder rationale that is long enough to pass.', conviction: 'low', ...over,
});

describe('AzureAnalysisRepository feature-020 confirmationItems mapping', () => {
  it('round-trips a populated confirmationItems array', () => {
    const back = repo._analysisFromEntity(repo._analysisToEntity(base({ confirmationItems: [ITEM] })));
    expect(back.confirmationItems).toEqual([ITEM]);
  });

  it('omits the column when empty and reads back as []; re-run replace drops it', () => {
    expect(repo._analysisToEntity(base({ confirmationItems: [ITEM] })).confirmationItemsJson).toBeDefined();
    const entity = repo._analysisToEntity(base({ confirmationItems: [] }));
    expect(entity.confirmationItemsJson).toBeUndefined();
    expect(repo._analysisFromEntity(entity).confirmationItems).toEqual([]);
  });

  it('reads a pre-feature row back as [] and tolerates malformed JSON', () => {
    const row = {
      partitionKey: 'weekly', rowKey: '2026-01-01', status: 'completed',
      generatedAt: '2026-01-01T21:00:00Z', modelUsed: 'm', promptVersion: 'v',
      summary: 'Old analysis summary that predates feature 020 entirely here ok.',
      markdownBody: 'y'.repeat(250), tokensIn: 1, tokensOut: 1, costUsd: 0.1, durationMs: 1,
    };
    expect(repo._analysisFromEntity(row).confirmationItems).toEqual([]);
    expect(repo._analysisFromEntity({ ...row, confirmationItemsJson: '{not valid' }).confirmationItems).toEqual([]);
  });

  it('rejects a malformed item at the entity boundary', () => {
    expect(() => base({ confirmationItems: [{ ...ITEM, reason: 'bogus' }] })).toThrow(/confirmationItem/);
    expect(() => base({ confirmationItems: [{ ...ITEM, lastIndex: -1 }] })).toThrow(/confirmationItem/);
  });
});

describe('AzureAnalysisRepository feature-020 order ageWeeks mapping', () => {
  it('round-trips ageWeeks and writes the column only when > 0', () => {
    const entity = repo._orderToEntity(order({ ageWeeks: 2 }));
    expect(entity.ageWeeks).toBe(2);
    expect(repo._orderFromEntity({ ...entity }).ageWeeks).toBe(2);
    expect(repo._orderToEntity(order()).ageWeeks).toBeUndefined();
  });

  it('reads a pre-feature order row as ageWeeks 0', () => {
    const entity = repo._orderToEntity(order());
    expect(repo._orderFromEntity(entity).ageWeeks).toBe(0);
  });

  it('validates ageWeeks as an integer between 0 and 8 inclusive', () => {
    expect(order({ ageWeeks: 8 }).ageWeeks).toBe(8);
    expect(() => order({ ageWeeks: 9 })).toThrow(/ageWeeks/);
    expect(() => order({ ageWeeks: -1 })).toThrow(/ageWeeks/);
    expect(() => order({ ageWeeks: 1.5 })).toThrow(/ageWeeks/);
  });
});
