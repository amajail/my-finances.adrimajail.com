/**
 * AzureInstructionsRepository Unit Tests
 *
 * Focus: the chunked storage of large instructions documents. Azure Table
 * Storage caps a single string property at 64 KB (32K UTF-16 chars); the
 * document can be up to 256 KB, so `content`/`value` are split across multiple
 * properties and reassembled on read. Feature: 005-editable-metaprompt.
 */

const AzureInstructionsRepository = require('../../../../src/infrastructure/repositories/AzureInstructionsRepository');
const { createMockTableClient } = require('../../../helpers/mock-table-client');

const CHUNK_CHARS = 32000;

function makeDb() {
  return {
    initialize: jest.fn(async () => {}),
    settingsClient: createMockTableClient(),
    instructionsHistoryClient: createMockTableClient(),
  };
}

describe('AzureInstructionsRepository (chunked storage)', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = makeDb();
    repo = new AzureInstructionsRepository(db);
  });

  it('round-trips a small document in a single chunk', async () => {
    const content = '# Small doc\n\nWell under one chunk.';
    const entry = await repo.saveActive({ content, source: 'edit', changeNote: 'small' });

    expect(await (await repo.getActive()).content).toBe(content);
    const fetched = await repo.getHistoryEntry(entry.id);
    expect(fetched.content).toBe(content);
  });

  it('splits a >64 KB document into multiple ≤32K-char properties and reassembles it', async () => {
    // 200,000 ASCII chars ≈ 195 KB — far past the 64 KB single-property cap.
    const content = 'A'.repeat(200000);
    const entry = await repo.saveActive({ content, source: 'edit' });

    // History row: multiple content chunks, none over the char cap.
    const historyRow = db.instructionsHistoryClient._getAllEntities()[0];
    expect(historyRow.contentChunks).toBe(Math.ceil(200000 / CHUNK_CHARS));
    expect(historyRow.content.length).toBeLessThanOrEqual(CHUNK_CHARS);
    expect(historyRow.content1.length).toBeLessThanOrEqual(CHUNK_CHARS);
    expect(historyRow.content).not.toBe(content); // it's only the first slice

    // Settings (active) row: same chunking on `value`.
    const settingsRow = db.settingsClient._getAllEntities()[0];
    expect(settingsRow.valueChunks).toBe(Math.ceil(200000 / CHUNK_CHARS));
    expect(settingsRow.value.length).toBeLessThanOrEqual(CHUNK_CHARS);

    // Reads reassemble to the exact original.
    expect((await repo.getActive()).content).toBe(content);
    expect((await repo.getHistoryEntry(entry.id)).content).toBe(content);
  });

  it('reports reassembled contentBytes in listHistory for chunked rows', async () => {
    const content = 'B'.repeat(100000);
    await repo.saveActive({ content, source: 'edit' });

    const { entries } = { entries: await repo.listHistory({ limit: 10 }) };
    expect(entries[0].contentBytes).toBe(Buffer.byteLength(content, 'utf8'));
  });

  it('does not leak stale chunks when a longer version is overwritten by a shorter one', async () => {
    await repo.saveActive({ content: 'C'.repeat(200000), source: 'edit' }); // many chunks
    await repo.saveActive({ content: 'short doc', source: 'edit' });        // one chunk

    // Active read is bounded by the current valueChunks count → exact short value.
    expect((await repo.getActive()).content).toBe('short doc');
  });

  it('reads legacy single-property rows without a chunk count (back-compat)', async () => {
    // Simulate a row written before chunking: plain `value`, no `valueChunks`.
    await db.settingsClient.upsertEntity(
      { partitionKey: 'settings', rowKey: 'analysis.instructionsV1', value: 'legacy single-prop', historyRowKey: 'rk', updatedAt: 't' },
      'Replace'
    );
    expect((await repo.getActive()).content).toBe('legacy single-prop');
  });
});
