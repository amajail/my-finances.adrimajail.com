/**
 * Unit tests for MCP tool handlers: usage fields, arg validation, error codes.
 */
const handlers = {};
jest.mock('@azure/functions', () => ({
  app: { mcpTool: jest.fn((name, cfg) => { handlers[cfg.toolName] = cfg.handler; }) },
}));

const mockRepo = { getLatest: jest.fn(), getByDate: jest.fn() };
const mockSetStatus = { execute: jest.fn() };
const mockAudit = { execute: jest.fn() };
const mockUpdate = { execute: jest.fn() };
jest.mock('../../../src/application/di/container', () => ({
  getAnalysisRepository: () => mockRepo,
  getSetOrderExecutionStatus: () => mockSetStatus,
  getListAuditEntries: () => mockAudit,
  getGuardedUpdatePosition: () => mockUpdate,
}));

require('../../../src/functions/mcp');

const call = async (tool, args) =>
  JSON.parse(await handlers[tool]({}, { triggerMetadata: { mcptoolargs: args } }));

const analysis = (over = {}) => ({
  date: '2026-10-24', status: 'completed', generatedAt: new Date('2026-10-24T12:00:00Z'),
  summary: 's', markdownBody: 'b', modelUsed: 'm', tokensIn: 100, tokensOut: 50, costUsd: 0.12,
  isCompleted: () => true, ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('list_weekly_analyses', () => {
  it('includes usage fields and clamps limit', async () => {
    mockRepo.getLatest.mockResolvedValue([analysis()]);
    const out = await call('list_weekly_analyses', { limit: '9999' });
    expect(mockRepo.getLatest).toHaveBeenCalledWith(200);
    expect(out.items[0]).toMatchObject({ tokensIn: 100, tokensOut: 50, costUsd: 0.12 });
  });
  it('defaults limit to 20', async () => {
    mockRepo.getLatest.mockResolvedValue([]);
    await call('list_weekly_analyses', {});
    expect(mockRepo.getLatest).toHaveBeenCalledWith(20);
  });
});

describe('get_weekly_analysis', () => {
  it('includes usage fields', async () => {
    mockRepo.getByDate.mockResolvedValue({ analysis: analysis(), orders: [] });
    const out = await call('get_weekly_analysis', { date: '2026-10-24' });
    expect(out).toMatchObject({ tokensIn: 100, tokensOut: 50, costUsd: 0.12 });
  });
  it('exposes ageWeeks per order and confirmationItems (feature 020), defaulting for old rows', async () => {
    const item = { broker: 'BROKER', symbol: 'SYMBOL', side: 'buy', quantity: 5, ageWeeks: 3, originDate: '2026-10-03', lastDate: '2026-10-17', lastIndex: 0, reason: 'stale', proposedStatus: null };
    mockRepo.getByDate.mockResolvedValue({
      analysis: analysis({ confirmationItems: [item] }),
      orders: [
        { index: 0, broker: 'BROKER', symbol: 'SYMBOL', side: 'buy', quantity: 5, rationale: 'r', conviction: 'low', ageWeeks: 2 },
        { index: 1, broker: 'BROKER', symbol: 'OTHER', side: 'sell', quantity: 1, rationale: 'r', conviction: 'low' },
      ],
    });
    const out = await call('get_weekly_analysis', { date: '2026-10-24' });
    expect(out.orders.map((o) => o.ageWeeks)).toEqual([2, 0]);
    expect(out.confirmationItems).toEqual([item]);
    mockRepo.getByDate.mockResolvedValue({ analysis: analysis(), orders: [] });
    expect((await call('get_weekly_analysis', { date: '2026-10-24' })).confirmationItems).toEqual([]);
  });
  it('exposes sustainedTriggers (feature 021), null for rows without them', async () => {
    const rows = [{ key: 'riesgoPais', status: 'building', heldDays: 14, durationMet: false }];
    mockRepo.getByDate.mockResolvedValue({ analysis: analysis({ sustainedTriggers: rows }), orders: [] });
    expect((await call('get_weekly_analysis', { date: '2026-10-24' })).sustainedTriggers).toEqual(rows);
    mockRepo.getByDate.mockResolvedValue({ analysis: analysis(), orders: [] });
    expect((await call('get_weekly_analysis', { date: '2026-10-24' })).sustainedTriggers).toBeNull();
  });
  it('returns codes on errors', async () => {
    expect((await call('get_weekly_analysis', { date: 'bad' })).code).toBe('ValidationError');
    mockRepo.getByDate.mockResolvedValue(null);
    expect((await call('get_weekly_analysis', { date: '2026-01-01' })).code).toBe('NotFound');
  });
});

describe('arg handling', () => {
  it('rejects a non-integer index', async () => {
    const out = await call('set_order_execution_status', { date: '2026-10-24', index: '1.5', status: 'executed' });
    expect(out.code).toBe('ValidationError');
    expect(mockSetStatus.execute).not.toHaveBeenCalled();
  });
  it('coerces a string index to an integer', async () => {
    mockSetStatus.execute.mockResolvedValue({});
    await call('set_order_execution_status', { date: '2026-10-24', index: '2', status: 'executed' });
    expect(mockSetStatus.execute).toHaveBeenCalledWith(expect.objectContaining({ index: 2 }));
  });
  it('clamps audit limit to 1-100', async () => {
    mockAudit.execute.mockResolvedValue({});
    await call('list_audit_entries', { limit: 500 });
    expect(mockAudit.execute).toHaveBeenCalledWith({ limit: 100 });
  });
  it('passes an empty-string note through so notes can be cleared', async () => {
    mockUpdate.execute.mockResolvedValue({});
    await call('update_position', { broker: 'iol', rowKey: 'stock__SYMBOL', notes: '' });
    expect(mockUpdate.execute).toHaveBeenCalledWith(expect.objectContaining({ notes: '' }));
  });
});
