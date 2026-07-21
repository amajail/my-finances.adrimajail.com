/**
 * ListAuditEntries use case — feature 018.
 */

const ListAuditEntries = require('../../../../src/application/use-cases/audit/ListAuditEntries');

describe('ListAuditEntries', () => {
  function makeRepo(entries = []) {
    return { listRecent: jest.fn().mockResolvedValue(entries) };
  }

  it('returns count and entries from the repository', async () => {
    const entries = [{ operation: 'update_position' }, { operation: 'create_position' }];
    const auditRepository = makeRepo(entries);
    const result = await new ListAuditEntries({ auditRepository }).execute({ limit: 10 });
    expect(result).toEqual({ count: 2, entries });
    expect(auditRepository.listRecent).toHaveBeenCalledWith(10);
  });

  it('defaults the limit to 20 and clamps to 1..100', async () => {
    const auditRepository = makeRepo();
    const useCase = new ListAuditEntries({ auditRepository });

    await useCase.execute();
    expect(auditRepository.listRecent).toHaveBeenLastCalledWith(20);

    await useCase.execute({ limit: 0 });
    expect(auditRepository.listRecent).toHaveBeenLastCalledWith(1);

    await useCase.execute({ limit: 500 });
    expect(auditRepository.listRecent).toHaveBeenLastCalledWith(100);

    await useCase.execute({ limit: 'not-a-number' });
    expect(auditRepository.listRecent).toHaveBeenLastCalledWith(20);
  });
});
