/**
 * AzureAuditRepository — feature 018 append-only write-audit trail.
 *
 * Mocks the Azure table client (no Azurite) to exercise the inverted-timestamp
 * rowKey scheme, entity mapping (changes/details JSON columns), and listRecent
 * limit clamping.
 */

const AzureAuditRepository = require('../../../../src/infrastructure/repositories/AzureAuditRepository');

function mockDb() {
  const rows = [];
  const auditClient = {
    createEntity: jest.fn(async (entity) => { rows.push({ ...entity }); }),
    listEntities: jest.fn(() => {
      // Azure Tables returns rows in ascending rowKey order within a partition.
      const sorted = [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey));
      return (async function* () { for (const e of sorted) yield e; })();
    }),
  };
  return { initialize: jest.fn(), auditClient, _rows: rows };
}

function entry(over = {}) {
  return {
    operation: 'update_position',
    targetType: 'position',
    targetId: 'BROKER/stock__SYMBOL',
    changes: [{ field: 'quantity', old: 10, new: 12 }],
    source: 'mcp',
    ...over,
  };
}

describe('AzureAuditRepository', () => {
  it('appends with inverted-timestamp rowKeys so newer entries sort first', async () => {
    const db = mockDb();
    let t = 1000000000000;
    const repo = new AzureAuditRepository(db, { clock: () => new Date(t), suffix: () => 'aaaa' });

    await repo.append(entry({ targetId: 'first' }));
    t += 60000;
    await repo.append(entry({ targetId: 'second' }));

    const [older, newer] = db._rows;
    expect(newer.rowKey < older.rowKey).toBe(true); // newer inverts to a smaller key

    const listed = await repo.listRecent(10);
    expect(listed.map((e) => e.targetId)).toEqual(['second', 'first']);
  });

  it('same-millisecond appends get distinct rowKeys via the suffix', async () => {
    const db = mockDb();
    const suffixes = ['aaaa', 'bbbb'];
    const repo = new AzureAuditRepository(db, {
      clock: () => new Date(1000000000000),
      suffix: () => suffixes.shift(),
    });
    await repo.append(entry());
    await repo.append(entry());
    expect(db._rows[0].rowKey).not.toBe(db._rows[1].rowKey);
  });

  it('round-trips changes, details, confirmationUsed, and source', async () => {
    const db = mockDb();
    const repo = new AzureAuditRepository(db, { clock: () => new Date(1000000000000), suffix: () => 'aaaa' });
    await repo.append(entry({
      details: { totalSymbols: 3, succeeded: 2, failed: 1 },
      confirmationUsed: true,
    }));

    const [listed] = await repo.listRecent(1);
    expect(listed.changes).toEqual([{ field: 'quantity', old: 10, new: 12 }]);
    expect(listed.details).toEqual({ totalSymbols: 3, succeeded: 2, failed: 1 });
    expect(listed.confirmationUsed).toBe(true);
    expect(listed.source).toBe('mcp');
    expect(listed.timestamp).toBe(new Date(1000000000000).toISOString());
    // Stored as JSON-string columns, not nested objects (Azure Tables is flat).
    expect(typeof db._rows[0].changes).toBe('string');
  });

  it('clamps listRecent limit to 1..100 and defaults to 20', async () => {
    const db = mockDb();
    let t = 1000000000000;
    const repo = new AzureAuditRepository(db, { clock: () => new Date((t += 1000)), suffix: () => 'aaaa' });
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await repo.append(entry({ targetId: `t${i}` }));
      t += 1000;
    }
    expect((await repo.listRecent()).length).toBe(20);
    expect((await repo.listRecent(0)).length).toBe(1);
    expect((await repo.listRecent(999)).length).toBe(25); // capped at 100, only 25 exist
    expect((await repo.listRecent('5')).length).toBe(5);
  });
});
