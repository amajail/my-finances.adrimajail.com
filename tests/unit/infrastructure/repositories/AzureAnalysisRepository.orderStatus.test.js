/**
 * AzureAnalysisRepository — feature 007 order execution status.
 *
 * Mocks the Azure table client (no Azurite) to exercise the order-status
 * mappers, setOrderExecutionStatus (Merge), hasMarkedOrders, and listAllOrders.
 */

const AzureAnalysisRepository = require('../../../../src/infrastructure/repositories/AzureAnalysisRepository');
const { NotFoundError } = require('../../../../src/shared/errors');

function orderEntity(over = {}) {
  return {
    partitionKey: '2026-06-12', rowKey: '00', indexNum: 0,
    broker: 'ibkr', symbol: 'AAA', side: 'buy', quantity: 10,
    rationale: 'A sufficiently long rationale string here.', conviction: 'high',
    ...over,
  };
}

function mockDb(orders = []) {
  const store = new Map(orders.map((o) => [`${o.partitionKey}/${o.rowKey}`, { ...o }]));
  const ordersClient = {
    getEntity: jest.fn(async (pk, rk) => {
      const e = store.get(`${pk}/${rk}`);
      if (!e) { const err = new Error('404'); err.statusCode = 404; throw err; }
      return e;
    }),
    updateEntity: jest.fn(async (entity) => {
      const key = `${entity.partitionKey}/${entity.rowKey}`;
      store.set(key, { ...store.get(key), ...entity });
    }),
    listEntities: jest.fn((opts) => {
      let items = [...store.values()];
      const filter = opts && opts.queryOptions && opts.queryOptions.filter;
      if (filter) {
        const m = filter.match(/PartitionKey eq '([^']+)'/);
        if (m) items = items.filter((e) => e.partitionKey === m[1]);
      }
      return (async function* () { for (const e of items) yield e; })();
    }),
  };
  return { initialize: jest.fn(), ordersClient, _store: store };
}

describe('AzureAnalysisRepository order status', () => {
  it('round-trips execution columns through the mappers', () => {
    const repo = new AzureAnalysisRepository({});
    const entity = repo._orderToEntity({
      analysisDate: '2026-06-12', index: 0, broker: 'ibkr', symbol: 'AAA', side: 'buy',
      quantity: 10, rationale: 'A sufficiently long rationale string here.', conviction: 'high',
      executionStatus: 'executed', executionNote: 'filled', executionUpdatedAt: '2026-06-13T00:00:00Z',
    });
    expect(entity.executionStatus).toBe('executed');
    const back = repo._orderFromEntity(entity);
    expect(back.executionStatus).toBe('executed');
    expect(back.executionNote).toBe('filled');
  });

  it('reads a pre-feature order row (no columns) back as pending', () => {
    const repo = new AzureAnalysisRepository({});
    const back = repo._orderFromEntity(orderEntity());
    expect(back.executionStatus).toBe('pending');
    expect(back.executionNote).toBeNull();
  });

  it('setOrderExecutionStatus Merge-patches the row and returns the saved status', async () => {
    const db = mockDb([orderEntity()]);
    const repo = new AzureAnalysisRepository(db);
    const res = await repo.setOrderExecutionStatus('2026-06-12', 0, { status: 'executed', note: 'filled', updatedAt: '2026-06-13T00:00:00Z' });
    expect(res.executionStatus).toBe('executed');
    expect(db.ordersClient.updateEntity).toHaveBeenCalledWith(
      expect.objectContaining({ partitionKey: '2026-06-12', rowKey: '00', executionStatus: 'executed' }),
      'Merge'
    );
    expect(db._store.get('2026-06-12/00').executionStatus).toBe('executed');
  });

  it('setOrderExecutionStatus throws NotFoundError for a missing order', async () => {
    const repo = new AzureAnalysisRepository(mockDb([]));
    await expect(repo.setOrderExecutionStatus('2026-06-12', 9, { status: 'executed', updatedAt: 't' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('hasMarkedOrders is false when all pending, true after a non-pending mark', async () => {
    const db = mockDb([orderEntity({ rowKey: '00' }), orderEntity({ rowKey: '01', indexNum: 1 })]);
    const repo = new AzureAnalysisRepository(db);
    expect(await repo.hasMarkedOrders('2026-06-12')).toBe(false);
    db._store.get('2026-06-12/01').executionStatus = 'skipped';
    expect(await repo.hasMarkedOrders('2026-06-12')).toBe(true);
  });

  it('listAllOrders returns every order across dates', async () => {
    const repo = new AzureAnalysisRepository(mockDb([
      orderEntity({ partitionKey: '2026-06-05', rowKey: '00' }),
      orderEntity({ partitionKey: '2026-06-12', rowKey: '00' }),
    ]));
    const all = await repo.listAllOrders();
    expect(all).toHaveLength(2);
    expect(all[0].constructor.name).toBe('SuggestedOrder');
  });
});
