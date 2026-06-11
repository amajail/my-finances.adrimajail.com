/**
 * InstructionsHistoryEntry entity tests
 *
 * Feature: 005-editable-metaprompt.
 */

const InstructionsHistoryEntry = require('../../../../src/domain/entities/InstructionsHistoryEntry');
const { DomainError } = require('../../../../src/shared/errors');

function fixture(overrides = {}) {
  return {
    id: '8284032399876-a3f9',
    content: '## Instructions\n- Role: example\n- Guardrails: example\n',
    timestamp: '2026-06-11T14:02:03.456Z',
    changeNote: 'smoke test',
    source: 'edit',
    restoreOfRowKey: null,
    ...overrides,
  };
}

describe('InstructionsHistoryEntry', () => {
  it('constructs a valid edit entry', () => {
    const e = new InstructionsHistoryEntry(fixture());
    expect(e.id).toBe('8284032399876-a3f9');
    expect(e.source).toBe('edit');
    expect(e.changeNote).toBe('smoke test');
    expect(e.restoreOfRowKey).toBeNull();
  });

  it('constructs a valid restore entry', () => {
    const e = new InstructionsHistoryEntry(fixture({
      source: 'restore',
      restoreOfRowKey: '8284033012000-d0e1',
      changeNote: 'Restored from 2026-06-09T08:00:00.000Z',
    }));
    expect(e.source).toBe('restore');
    expect(e.restoreOfRowKey).toBe('8284033012000-d0e1');
  });

  it('rejects empty content', () => {
    expect(() => new InstructionsHistoryEntry(fixture({ content: '' })))
      .toThrow(/content is required/);
  });

  it('rejects whitespace-only content', () => {
    expect(() => new InstructionsHistoryEntry(fixture({ content: '   \n\t\n' })))
      .toThrow(/content is required/);
  });

  it('exposes a 256 KB byte cap', () => {
    expect(InstructionsHistoryEntry.MAX_BYTES).toBe(262144);
  });

  it('accepts content at the 256 KB boundary (just under)', () => {
    const content = 'a'.repeat(InstructionsHistoryEntry.MAX_BYTES); // ASCII, 1 byte each
    expect(() => new InstructionsHistoryEntry(fixture({ content }))).not.toThrow();
  });

  it('rejects content one byte over the 256 KB cap', () => {
    const content = 'a'.repeat(InstructionsHistoryEntry.MAX_BYTES + 1);
    expect(() => new InstructionsHistoryEntry(fixture({ content })))
      .toThrow(/content exceeds maximum size of 262144 bytes/);
  });

  it('counts bytes, not characters (multi-byte UTF-8)', () => {
    // The em dash '—' is 3 bytes in UTF-8. 87382 em-dashes = 262146 bytes > 256 KB.
    const content = '—'.repeat(87382);
    expect(() => new InstructionsHistoryEntry(fixture({ content })))
      .toThrow(/content exceeds maximum size/);
  });

  it('rejects an unknown source value', () => {
    expect(() => new InstructionsHistoryEntry(fixture({ source: 'mystery' })))
      .toThrow(/source must be one of: edit, restore/);
  });

  it('requires restoreOfRowKey when source is "restore"', () => {
    expect(() => new InstructionsHistoryEntry(fixture({
      source: 'restore',
      restoreOfRowKey: null,
    }))).toThrow(/restoreOfRowKey is required when source is "restore"/);
  });

  it('forbids restoreOfRowKey when source is "edit"', () => {
    expect(() => new InstructionsHistoryEntry(fixture({
      source: 'edit',
      restoreOfRowKey: 'some-rowkey',
    }))).toThrow(/restoreOfRowKey must be null when source is "edit"/);
  });

  it('normalizes empty-after-trim changeNote to null', () => {
    const e = new InstructionsHistoryEntry(fixture({ changeNote: '   ' }));
    expect(e.changeNote).toBeNull();
  });

  it('rejects changeNote over 280 characters', () => {
    const note = 'x'.repeat(281);
    expect(() => new InstructionsHistoryEntry(fixture({ changeNote: note })))
      .toThrow(/changeNote exceeds 280 characters/);
  });

  it('requires id', () => {
    expect(() => new InstructionsHistoryEntry(fixture({ id: '' })))
      .toThrow(/id is required/);
  });

  it('requires timestamp', () => {
    expect(() => new InstructionsHistoryEntry(fixture({ timestamp: '' })))
      .toThrow(/timestamp is required/);
  });

  it('throws DomainError for invalid input', () => {
    try {
      // eslint-disable-next-line no-new
      new InstructionsHistoryEntry(fixture({ content: '' }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
    }
  });

  it('is immutable (frozen)', () => {
    const e = new InstructionsHistoryEntry(fixture());
    expect(Object.isFrozen(e)).toBe(true);
  });

  it('buildRowKey returns descending-prefix + nonce format', () => {
    const ts = 1715967600123;
    const rowKey = InstructionsHistoryEntry.buildRowKey(ts);
    expect(rowKey).toMatch(/^\d{13}-[0-9a-f]{4}$/);
    const [desc] = rowKey.split('-');
    expect(Number(desc)).toBe(9999999999999 - ts);
  });

  it('buildRowKey produces distinct rowKeys for the same epoch', () => {
    // Same epoch → different nonces → different rowKeys.
    const a = InstructionsHistoryEntry.buildRowKey(1715967600123);
    const b = InstructionsHistoryEntry.buildRowKey(1715967600123);
    expect(a).not.toBe(b);
    expect(a.split('-')[0]).toBe(b.split('-')[0]);
  });

  it('toJSON returns a plain object with all fields', () => {
    const e = new InstructionsHistoryEntry(fixture());
    expect(e.toJSON()).toEqual({
      id: '8284032399876-a3f9',
      content: '## Instructions\n- Role: example\n- Guardrails: example\n',
      timestamp: '2026-06-11T14:02:03.456Z',
      changeNote: 'smoke test',
      source: 'edit',
      restoreOfRowKey: null,
    });
  });
});
