/**
 * SetOrderExecutionStatus use-case tests (feature 007).
 */

const SetOrderExecutionStatus = require('../../../../../src/application/use-cases/analysis/SetOrderExecutionStatus');
const { ValidationError } = require('../../../../../src/shared/errors');

function build({ repo } = {}) {
  const analysisRepository = repo || {
    setOrderExecutionStatus: jest.fn(async (date, index, patch) => ({ date, index, ...patch, executionStatus: patch.status, executionNote: patch.note })),
  };
  const useCase = new SetOrderExecutionStatus({
    analysisRepository,
    clock: () => new Date('2026-06-13T10:00:00Z'),
  });
  return { useCase, analysisRepository };
}

describe('SetOrderExecutionStatus', () => {
  it('persists a valid status with a stamped updatedAt', async () => {
    const { useCase, analysisRepository } = build();
    await useCase.execute({ date: '2026-06-12', index: '1', status: 'executed', note: 'filled' });
    expect(analysisRepository.setOrderExecutionStatus).toHaveBeenCalledWith('2026-06-12', 1, {
      status: 'executed', note: 'filled', updatedAt: '2026-06-13T10:00:00.000Z', executionPrice: null,
    });
  });

  it('rejects an invalid status', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ date: '2026-06-12', index: 0, status: 'mutated' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a malformed date', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ date: 'nope', index: 0, status: 'skipped' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a note over 500 chars', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ date: '2026-06-12', index: 0, status: 'executed', note: 'x'.repeat(501) }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('passes note=null through when omitted (clears the note)', async () => {
    const { useCase, analysisRepository } = build();
    await useCase.execute({ date: '2026-06-12', index: 0, status: 'pending' });
    expect(analysisRepository.setOrderExecutionStatus).toHaveBeenCalledWith('2026-06-12', 0, expect.objectContaining({ note: null }));
  });

  it('lists the allowed statuses in the rejection message', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ date: '2026-06-12', index: 0, status: 'done' }))
      .rejects.toThrow('status must be one of: pending, executed, partial, skipped');
  });
});

describe('SetOrderExecutionStatus — executionPrice + audit (feature 018)', () => {
  function buildWithPrevious({ auditRepository } = {}) {
    const analysisRepository = {
      setOrderExecutionStatus: jest.fn(async (date, index, patch) => ({
        date,
        index,
        executionStatus: patch.status,
        executionNote: patch.note,
        executionUpdatedAt: patch.updatedAt,
        executionPrice: patch.executionPrice != null ? patch.executionPrice : null,
        previous: { executionStatus: 'pending', executionNote: null, executionPrice: null },
      })),
    };
    const useCase = new SetOrderExecutionStatus({
      analysisRepository,
      auditRepository,
      clock: () => new Date('2026-06-13T10:00:00Z'),
    });
    return { useCase, analysisRepository };
  }

  it('passes a parsed executionPrice through to the repository patch', async () => {
    const { useCase, analysisRepository } = buildWithPrevious();
    await useCase.execute({ date: '2026-06-12', index: 0, status: 'executed', executionPrice: '42.50' });
    expect(analysisRepository.setOrderExecutionStatus).toHaveBeenCalledWith(
      '2026-06-12', 0, expect.objectContaining({ executionPrice: 42.5 })
    );
  });

  it('rejects a non-positive or non-numeric executionPrice', async () => {
    const { useCase } = buildWithPrevious();
    await expect(useCase.execute({ date: '2026-06-12', index: 0, status: 'executed', executionPrice: -1 }))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(useCase.execute({ date: '2026-06-12', index: 0, status: 'executed', executionPrice: 'abc' }))
      .rejects.toThrow('executionPrice must be a positive number');
  });

  it('appends an audit entry with old/new values and strips `previous` from the result', async () => {
    const auditRepository = { append: jest.fn().mockResolvedValue(undefined) };
    const { useCase } = buildWithPrevious({ auditRepository });
    const result = await useCase.execute({
      date: '2026-06-12', index: 2, status: 'executed', executionPrice: 42.5, _audit: { source: 'mcp' },
    });

    expect(result.previous).toBeUndefined();
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'set_order_execution_status',
      targetType: 'order',
      targetId: '2026-06-12/2',
      source: 'mcp',
      changes: expect.arrayContaining([
        { field: 'executionStatus', old: 'pending', new: 'executed' },
        { field: 'executionPrice', old: null, new: 42.5 },
      ]),
    }));
  });

  it('still succeeds when the audit append fails', async () => {
    const auditRepository = { append: jest.fn().mockRejectedValue(new Error('audit down')) };
    const { useCase } = buildWithPrevious({ auditRepository });
    const result = await useCase.execute({ date: '2026-06-12', index: 0, status: 'skipped' });
    expect(result.executionStatus).toBe('skipped');
  });

  it('works without an auditRepository (backward compatible)', async () => {
    const { useCase } = buildWithPrevious();
    const result = await useCase.execute({ date: '2026-06-12', index: 0, status: 'partial' });
    expect(result.executionStatus).toBe('partial');
  });
});
