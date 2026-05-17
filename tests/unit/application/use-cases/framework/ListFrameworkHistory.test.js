/**
 * ListFrameworkHistory use-case tests.
 *
 * Feature: 004-editable-strategic-framework. Covers FR-006, FR-013, plus
 * limit clamping and empty-state.
 */

const ListFrameworkHistory = require('../../../../../src/application/use-cases/framework/ListFrameworkHistory');
const { ValidationError } = require('../../../../../src/shared/errors');

function makeRepo(entries = []) {
  return {
    listHistory: jest.fn(async ({ limit }) => entries.slice(0, limit)),
    getActive: jest.fn(),
    saveActive: jest.fn(),
    getHistoryEntry: jest.fn(),
  };
}

describe('ListFrameworkHistory', () => {
  it('returns repository rows mapped to API shape', async () => {
    const repo = makeRepo([
      { id: '8284000000000-aaaa', timestamp: '2026-05-17T14:00:00Z', changeNote: 'edit one', source: 'edit', restoreOfRowKey: null, contentBytes: 100 },
      { id: '8284100000000-bbbb', timestamp: '2026-05-15T12:00:00Z', changeNote: null, source: 'restore', restoreOfRowKey: '9000000000000-zzzz', contentBytes: 90 },
    ]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    const result = await uc.execute({ limit: 10 });

    expect(result).toEqual({
      count: 2,
      entries: [
        {
          rowKey: '8284000000000-aaaa',
          timestamp: '2026-05-17T14:00:00Z',
          changeNote: 'edit one',
          source: 'edit',
          restoreOfRowKey: null,
          contentBytes: 100,
        },
        {
          rowKey: '8284100000000-bbbb',
          timestamp: '2026-05-15T12:00:00Z',
          changeNote: null,
          source: 'restore',
          restoreOfRowKey: '9000000000000-zzzz',
          contentBytes: 90,
        },
      ],
    });
  });

  it('defaults limit to 50 when omitted', async () => {
    const repo = makeRepo([]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    await uc.execute();

    expect(repo.listHistory).toHaveBeenCalledWith({ limit: 50 });
  });

  it('returns empty array (count 0) when no rows exist — FR-013 empty state', async () => {
    const repo = makeRepo([]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    const result = await uc.execute({ limit: 10 });

    expect(result).toEqual({ entries: [], count: 0 });
  });

  it('rejects limit below 1', async () => {
    const repo = makeRepo([]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    await expect(uc.execute({ limit: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(uc.execute({ limit: -5 })).rejects.toThrow(/limit must be between 1 and 200/);
  });

  it('rejects limit above 200', async () => {
    const repo = makeRepo([]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    await expect(uc.execute({ limit: 201 })).rejects.toThrow(/limit must be between 1 and 200/);
  });

  it('rejects non-integer limit', async () => {
    const repo = makeRepo([]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    await expect(uc.execute({ limit: 'abc' })).rejects.toThrow(/limit must be between/);
    await expect(uc.execute({ limit: 1.5 })).rejects.toThrow(/limit must be between/);
  });

  it('accepts the boundary values 1 and 200', async () => {
    const repo = makeRepo([]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    await expect(uc.execute({ limit: 1 })).resolves.toBeDefined();
    await expect(uc.execute({ limit: 200 })).resolves.toBeDefined();
  });

  it('null changeNote on a row stays null in the API shape', async () => {
    const repo = makeRepo([
      { id: 'x', timestamp: 't', changeNote: undefined, source: 'edit', restoreOfRowKey: undefined, contentBytes: 5 },
    ]);
    const uc = new ListFrameworkHistory({ frameworkRepository: repo });

    const result = await uc.execute();

    expect(result.entries[0].changeNote).toBeNull();
    expect(result.entries[0].restoreOfRowKey).toBeNull();
  });
});
