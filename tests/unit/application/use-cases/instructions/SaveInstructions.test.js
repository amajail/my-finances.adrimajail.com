/**
 * SaveInstructions use-case tests.
 *
 * Feature: 004-editable-strategic-framework.
 * Covers FR-004 (empty rejection), FR-011 (no-op detection),
 * FR-017 (256 KB cap), and validates source/restoreOfRowKey wiring.
 */

const SaveInstructions = require('../../../../../src/application/use-cases/instructions/SaveInstructions');
const InstructionsHistoryEntry = require('../../../../../src/domain/entities/InstructionsHistoryEntry');
const { ValidationError } = require('../../../../../src/shared/errors');

function makeRepo({
  active = null,
  savedEntry = null,
} = {}) {
  return {
    getActive: jest.fn(async () => active),
    saveActive: jest.fn(async (input) => {
      return savedEntry || new InstructionsHistoryEntry({
        id: '8000000000000-aaaa',
        content: input.content,
        timestamp: '2026-05-17T14:02:03.456Z',
        changeNote: input.changeNote,
        source: input.source,
        restoreOfRowKey: input.source === 'restore' ? input.restoreOfRowKey : null,
      });
    }),
    listHistory: jest.fn(),
    getHistoryEntry: jest.fn(),
  };
}

describe('SaveInstructions', () => {
  it('persists a new edit and returns the history rowKey', async () => {
    const repo = makeRepo({
      active: { content: 'old content', historyRowKey: '9000000000000-1111', updatedAt: '2026-05-10T00:00:00Z' },
    });
    const uc = new SaveInstructions({ instructionsRepository: repo });

    const result = await uc.execute({ content: 'new content', changeNote: 'bumped target' });

    expect(repo.saveActive).toHaveBeenCalledTimes(1);
    expect(repo.saveActive).toHaveBeenCalledWith({
      content: 'new content',
      changeNote: 'bumped target',
      source: 'edit',
      restoreOfRowKey: null,
    });
    expect(result).toEqual({
      historyRowKey: '8000000000000-aaaa',
      timestamp: '2026-05-17T14:02:03.456Z',
      noop: false,
    });
  });

  it('rejects empty content with ValidationError (FR-004)', async () => {
    const repo = makeRepo();
    const uc = new SaveInstructions({ instructionsRepository: repo });

    await expect(uc.execute({ content: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(uc.execute({ content: '' })).rejects.toThrow(/content is required/);
    expect(repo.saveActive).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only content', async () => {
    const repo = makeRepo();
    const uc = new SaveInstructions({ instructionsRepository: repo });

    await expect(uc.execute({ content: '   \n\n  ' })).rejects.toThrow(/content is required/);
    expect(repo.saveActive).not.toHaveBeenCalled();
  });

  it('rejects content over the 256 KB cap (FR-017)', async () => {
    const repo = makeRepo();
    const uc = new SaveInstructions({ instructionsRepository: repo });
    const tooBig = 'a'.repeat(InstructionsHistoryEntry.MAX_BYTES + 1);

    await expect(uc.execute({ content: tooBig })).rejects.toThrow(/exceeds maximum size of 262144 bytes/);
    expect(repo.saveActive).not.toHaveBeenCalled();
  });

  it('accepts content at the 256 KB boundary', async () => {
    const repo = makeRepo({ active: null });
    const uc = new SaveInstructions({ instructionsRepository: repo });
    const justRight = 'a'.repeat(InstructionsHistoryEntry.MAX_BYTES);

    await expect(uc.execute({ content: justRight })).resolves.toEqual(expect.objectContaining({ noop: false }));
    expect(repo.saveActive).toHaveBeenCalledTimes(1);
  });

  it('detects byte-identical no-op and skips write (FR-011)', async () => {
    const repo = makeRepo({
      active: {
        content: 'same content',
        historyRowKey: '9000000000000-1111',
        updatedAt: '2026-05-10T00:00:00Z',
      },
    });
    const uc = new SaveInstructions({ instructionsRepository: repo });

    const result = await uc.execute({ content: 'same content' });

    expect(repo.saveActive).not.toHaveBeenCalled();
    expect(result).toEqual({
      historyRowKey: '9000000000000-1111',
      timestamp: '2026-05-10T00:00:00Z',
      noop: true,
    });
  });

  it('normalizes CRLF and trailing whitespace before no-op compare', async () => {
    const repo = makeRepo({
      active: {
        content: 'line1\nline2\n',
        historyRowKey: '9000000000000-1111',
        updatedAt: '2026-05-10T00:00:00Z',
      },
    });
    const uc = new SaveInstructions({ instructionsRepository: repo });

    // CRLF-only diff + trailing whitespace → still a no-op.
    const result = await uc.execute({ content: '  line1\r\nline2\r\n  ' });

    expect(repo.saveActive).not.toHaveBeenCalled();
    expect(result.noop).toBe(true);
  });

  it('normalizes empty-after-trim changeNote to null', async () => {
    const repo = makeRepo({ active: null });
    const uc = new SaveInstructions({ instructionsRepository: repo });

    await uc.execute({ content: 'new', changeNote: '   ' });

    expect(repo.saveActive).toHaveBeenCalledWith(expect.objectContaining({
      changeNote: null,
    }));
  });

  it('rejects changeNote over 280 characters', async () => {
    const repo = makeRepo();
    const uc = new SaveInstructions({ instructionsRepository: repo });

    await expect(uc.execute({
      content: 'new',
      changeNote: 'x'.repeat(281),
    })).rejects.toThrow(/changeNote exceeds 280 characters/);
    expect(repo.saveActive).not.toHaveBeenCalled();
  });

  it('passes source=restore and restoreOfRowKey through to the repo', async () => {
    const repo = makeRepo({ active: null });
    const uc = new SaveInstructions({ instructionsRepository: repo });

    await uc.execute({
      content: 'restored content',
      changeNote: 'Restored from 2026-05-10T00:00:00Z',
      source: 'restore',
      restoreOfRowKey: '9000000000000-1111',
    });

    expect(repo.saveActive).toHaveBeenCalledWith({
      content: 'restored content',
      changeNote: 'Restored from 2026-05-10T00:00:00Z',
      source: 'restore',
      restoreOfRowKey: '9000000000000-1111',
    });
  });

  it('ignores restoreOfRowKey when source is edit', async () => {
    const repo = makeRepo({ active: null });
    const uc = new SaveInstructions({ instructionsRepository: repo });

    await uc.execute({
      content: 'edit content',
      source: 'edit',
      // Caller mistakenly passes restoreOfRowKey on an edit; we drop it.
      restoreOfRowKey: 'should-be-ignored',
    });

    expect(repo.saveActive).toHaveBeenCalledWith(expect.objectContaining({
      source: 'edit',
      restoreOfRowKey: null,
    }));
  });

  it('first save when no active framework exists succeeds', async () => {
    const repo = makeRepo({ active: null });
    const uc = new SaveInstructions({ instructionsRepository: repo });

    const result = await uc.execute({ content: 'first save' });

    expect(result.noop).toBe(false);
    expect(repo.saveActive).toHaveBeenCalledTimes(1);
  });
});
