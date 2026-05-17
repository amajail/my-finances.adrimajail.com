/**
 * RestoreFrameworkVersion use-case tests.
 *
 * Feature: 004-editable-strategic-framework. Covers FR-008 (restore creates
 * new entry, append-only), system-generated change note, and no-op restore.
 */

const RestoreFrameworkVersion = require('../../../../../src/application/use-cases/framework/RestoreFrameworkVersion');
const FrameworkHistoryEntry = require('../../../../../src/domain/entities/FrameworkHistoryEntry');
const { ValidationError, NotFoundError } = require('../../../../../src/shared/errors');

function makeTargetEntry(overrides = {}) {
  return new FrameworkHistoryEntry({
    id: '9000000000000-old1',
    content: 'historical content',
    timestamp: '2026-05-10T08:00:00.000Z',
    changeNote: 'original edit',
    source: 'edit',
    restoreOfRowKey: null,
    ...overrides,
  });
}

function makeRepo({ target = null } = {}) {
  return {
    getActive: jest.fn(async () => ({ content: 'currently active', historyRowKey: 'curr-x', updatedAt: 't' })),
    saveActive: jest.fn(),
    listHistory: jest.fn(),
    getHistoryEntry: jest.fn(async (k) => (target && target.id === k ? target : null)),
  };
}

function makeSaveFramework(returnValue = { historyRowKey: 'new-rk', timestamp: 'new-ts', noop: false }) {
  return {
    execute: jest.fn(async () => returnValue),
  };
}

describe('RestoreFrameworkVersion', () => {
  it('restores the target entry as a new history row with source=restore', async () => {
    const target = makeTargetEntry();
    const repo = makeRepo({ target });
    const saveFramework = makeSaveFramework();
    const uc = new RestoreFrameworkVersion({ frameworkRepository: repo, saveFramework });

    const result = await uc.execute({ rowKey: target.id });

    expect(saveFramework.execute).toHaveBeenCalledTimes(1);
    expect(saveFramework.execute).toHaveBeenCalledWith({
      content: target.content,
      changeNote: 'Restored from 2026-05-10T08:00:00.000Z',
      source: 'restore',
      restoreOfRowKey: target.id,
    });
    expect(result).toEqual({
      historyRowKey: 'new-rk',
      timestamp: 'new-ts',
      restoreOfRowKey: target.id,
      noop: false,
    });
  });

  it('throws NotFoundError when the target rowKey does not exist', async () => {
    const repo = makeRepo({ target: null });
    const saveFramework = makeSaveFramework();
    const uc = new RestoreFrameworkVersion({ frameworkRepository: repo, saveFramework });

    await expect(uc.execute({ rowKey: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    expect(saveFramework.execute).not.toHaveBeenCalled();
  });

  it('rejects missing/empty rowKey with ValidationError', async () => {
    const repo = makeRepo();
    const saveFramework = makeSaveFramework();
    const uc = new RestoreFrameworkVersion({ frameworkRepository: repo, saveFramework });

    await expect(uc.execute({})).rejects.toBeInstanceOf(ValidationError);
    await expect(uc.execute({ rowKey: '' })).rejects.toThrow(/rowKey is required/);
    await expect(uc.execute({ rowKey: '   ' })).rejects.toThrow(/rowKey is required/);
  });

  it('uses the caller-supplied changeNote when provided', async () => {
    const target = makeTargetEntry();
    const repo = makeRepo({ target });
    const saveFramework = makeSaveFramework();
    const uc = new RestoreFrameworkVersion({ frameworkRepository: repo, saveFramework });

    await uc.execute({ rowKey: target.id, changeNote: 'Reverting Friday experiment' });

    expect(saveFramework.execute).toHaveBeenCalledWith(expect.objectContaining({
      changeNote: 'Reverting Friday experiment',
    }));
  });

  it('rejects changeNote over 280 characters before touching the repo', async () => {
    const repo = makeRepo();
    const saveFramework = makeSaveFramework();
    const uc = new RestoreFrameworkVersion({ frameworkRepository: repo, saveFramework });

    await expect(uc.execute({
      rowKey: 'r-x',
      changeNote: 'y'.repeat(281),
    })).rejects.toThrow(/changeNote exceeds 280 characters/);

    expect(repo.getHistoryEntry).not.toHaveBeenCalled();
    expect(saveFramework.execute).not.toHaveBeenCalled();
  });

  it('returns noop:true when the target content equals current active (SaveFramework dedupes)', async () => {
    const target = makeTargetEntry();
    const repo = makeRepo({ target });
    const saveFramework = makeSaveFramework({
      historyRowKey: 'curr-x',
      timestamp: 'curr-t',
      noop: true,
    });
    const uc = new RestoreFrameworkVersion({ frameworkRepository: repo, saveFramework });

    const result = await uc.execute({ rowKey: target.id });

    expect(result.noop).toBe(true);
    expect(result.restoreOfRowKey).toBe(target.id);
  });

  it('does not mutate the target history entry (append-only invariant — observed via repo not being asked to mutate)', async () => {
    const target = makeTargetEntry();
    const repo = makeRepo({ target });
    const saveFramework = makeSaveFramework();
    const uc = new RestoreFrameworkVersion({ frameworkRepository: repo, saveFramework });

    await uc.execute({ rowKey: target.id });

    // Confirm we only invoked the read path on the target.
    expect(repo.getHistoryEntry).toHaveBeenCalledWith(target.id);
    expect(repo.saveActive).not.toHaveBeenCalled(); // restore goes through SaveFramework, not direct repo.saveActive
    expect(Object.isFrozen(target)).toBe(true);
  });
});
