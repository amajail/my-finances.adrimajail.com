/**
 * FrameworkHistoryEntry entity tests
 *
 * Feature: 004-editable-strategic-framework.
 */

const FrameworkHistoryEntry = require('../../../../src/domain/entities/FrameworkHistoryEntry');
const { DomainError } = require('../../../../src/shared/errors');

function fixture(overrides = {}) {
  return {
    id: '8284032399876-a3f9',
    content: '## Buckets\n- US: example\n- ARG: example\n',
    timestamp: '2026-05-17T14:02:03.456Z',
    changeNote: 'smoke test',
    source: 'edit',
    restoreOfRowKey: null,
    ...overrides,
  };
}

describe('FrameworkHistoryEntry', () => {
  it('constructs a valid edit entry', () => {
    const e = new FrameworkHistoryEntry(fixture());
    expect(e.id).toBe('8284032399876-a3f9');
    expect(e.source).toBe('edit');
    expect(e.changeNote).toBe('smoke test');
    expect(e.restoreOfRowKey).toBeNull();
  });

  it('constructs a valid restore entry', () => {
    const e = new FrameworkHistoryEntry(fixture({
      source: 'restore',
      restoreOfRowKey: '8284033012000-d0e1',
      changeNote: 'Restored from 2026-05-10T08:00:00.000Z',
    }));
    expect(e.source).toBe('restore');
    expect(e.restoreOfRowKey).toBe('8284033012000-d0e1');
  });

  it('rejects empty content', () => {
    expect(() => new FrameworkHistoryEntry(fixture({ content: '' })))
      .toThrow(/content is required/);
  });

  it('rejects whitespace-only content', () => {
    expect(() => new FrameworkHistoryEntry(fixture({ content: '   \n\t\n' })))
      .toThrow(/content is required/);
  });

  it('accepts content at the 60 KB boundary (just under)', () => {
    const content = 'a'.repeat(FrameworkHistoryEntry.MAX_BYTES); // ASCII, 1 byte each
    expect(() => new FrameworkHistoryEntry(fixture({ content }))).not.toThrow();
  });

  it('rejects content one byte over the 60 KB cap', () => {
    const content = 'a'.repeat(FrameworkHistoryEntry.MAX_BYTES + 1);
    expect(() => new FrameworkHistoryEntry(fixture({ content })))
      .toThrow(/content exceeds maximum size of 61440 bytes/);
  });

  it('counts bytes, not characters (multi-byte UTF-8)', () => {
    // The em dash '—' is 3 bytes in UTF-8. 20481 em-dashes = 61443 bytes > 60 KB.
    const content = '—'.repeat(20481);
    expect(() => new FrameworkHistoryEntry(fixture({ content })))
      .toThrow(/content exceeds maximum size/);
  });

  it('rejects an unknown source value', () => {
    expect(() => new FrameworkHistoryEntry(fixture({ source: 'mystery' })))
      .toThrow(/source must be one of: edit, restore/);
  });

  it('requires restoreOfRowKey when source is "restore"', () => {
    expect(() => new FrameworkHistoryEntry(fixture({
      source: 'restore',
      restoreOfRowKey: null,
    }))).toThrow(/restoreOfRowKey is required when source is "restore"/);
  });

  it('forbids restoreOfRowKey when source is "edit"', () => {
    expect(() => new FrameworkHistoryEntry(fixture({
      source: 'edit',
      restoreOfRowKey: 'some-rowkey',
    }))).toThrow(/restoreOfRowKey must be null when source is "edit"/);
  });

  it('normalizes empty-after-trim changeNote to null', () => {
    const e = new FrameworkHistoryEntry(fixture({ changeNote: '   ' }));
    expect(e.changeNote).toBeNull();
  });

  it('rejects changeNote over 280 characters', () => {
    const note = 'x'.repeat(281);
    expect(() => new FrameworkHistoryEntry(fixture({ changeNote: note })))
      .toThrow(/changeNote exceeds 280 characters/);
  });

  it('requires id', () => {
    expect(() => new FrameworkHistoryEntry(fixture({ id: '' })))
      .toThrow(/id is required/);
  });

  it('requires timestamp', () => {
    expect(() => new FrameworkHistoryEntry(fixture({ timestamp: '' })))
      .toThrow(/timestamp is required/);
  });

  it('throws DomainError for invalid input', () => {
    try {
      // eslint-disable-next-line no-new
      new FrameworkHistoryEntry(fixture({ content: '' }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
    }
  });

  it('is immutable (frozen)', () => {
    const e = new FrameworkHistoryEntry(fixture());
    expect(Object.isFrozen(e)).toBe(true);
  });

  it('buildRowKey returns descending-prefix + nonce format', () => {
    const ts = 1715967600123;
    const rowKey = FrameworkHistoryEntry.buildRowKey(ts);
    expect(rowKey).toMatch(/^\d{13}-[0-9a-f]{4}$/);
    const [desc] = rowKey.split('-');
    expect(Number(desc)).toBe(9999999999999 - ts);
  });

  it('buildRowKey produces distinct rowKeys for the same epoch', () => {
    // Same epoch → different nonces → different rowKeys.
    const a = FrameworkHistoryEntry.buildRowKey(1715967600123);
    const b = FrameworkHistoryEntry.buildRowKey(1715967600123);
    expect(a).not.toBe(b);
    expect(a.split('-')[0]).toBe(b.split('-')[0]);
  });

  it('toJSON returns a plain object with all fields', () => {
    const e = new FrameworkHistoryEntry(fixture());
    expect(e.toJSON()).toEqual({
      id: '8284032399876-a3f9',
      content: '## Buckets\n- US: example\n- ARG: example\n',
      timestamp: '2026-05-17T14:02:03.456Z',
      changeNote: 'smoke test',
      source: 'edit',
      restoreOfRowKey: null,
    });
  });
});
