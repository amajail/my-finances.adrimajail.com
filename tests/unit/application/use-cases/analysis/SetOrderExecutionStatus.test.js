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
      status: 'executed', note: 'filled', updatedAt: '2026-06-13T10:00:00.000Z',
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
});
