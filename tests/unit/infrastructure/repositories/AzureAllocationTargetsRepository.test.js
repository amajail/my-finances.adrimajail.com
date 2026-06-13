/**
 * AzureAllocationTargetsRepository — reads + parses the
 * `analysis.allocationTargetsV1` settings row. Resilient: missing / empty /
 * malformed / wrong-shape all resolve to null (FR-001a).
 */

const AzureAllocationTargetsRepository = require('../../../../src/infrastructure/repositories/AzureAllocationTargetsRepository');

const fakeSettings = (impl) => ({ get: impl });

const VALID = { version: 1, buckets: [{ key: 'us', label: 'US', classes: [] }] };

describe('AzureAllocationTargetsRepository.getActive', () => {
  it('parses a valid targets document', async () => {
    const repo = new AzureAllocationTargetsRepository(fakeSettings(async () => JSON.stringify(VALID)));
    const out = await repo.getActive();
    expect(out).toEqual(VALID);
  });

  it('returns null when the settings row is absent', async () => {
    const repo = new AzureAllocationTargetsRepository(fakeSettings(async () => null));
    expect(await repo.getActive()).toBeNull();
  });

  it('returns null when the value is empty/whitespace', async () => {
    const repo = new AzureAllocationTargetsRepository(fakeSettings(async () => '   '));
    expect(await repo.getActive()).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    const repo = new AzureAllocationTargetsRepository(fakeSettings(async () => '{not json'));
    expect(await repo.getActive()).toBeNull();
  });

  it('returns null when shape is wrong (no buckets array)', async () => {
    const repo = new AzureAllocationTargetsRepository(fakeSettings(async () => JSON.stringify({ version: 1 })));
    expect(await repo.getActive()).toBeNull();
  });

  it('returns null (never throws) when the settings read itself errors', async () => {
    const repo = new AzureAllocationTargetsRepository(fakeSettings(async () => { throw new Error('boom'); }));
    expect(await repo.getActive()).toBeNull();
  });
});
