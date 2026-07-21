/**
 * GuardedUpdatePosition use case — feature 018 (US2).
 *
 * The MCP-path wrapper: quantity-change guardrail with confirm flag,
 * null-preserves patch semantics, threshold-setting fallback, audit context.
 */

const GuardedUpdatePosition = require('../../../../src/application/use-cases/positions/GuardedUpdatePosition');
const UpdatePosition = require('../../../../src/application/use-cases/positions/UpdatePosition');
const Position = require('../../../../src/domain/entities/Position');
const { DomainError, NotFoundError } = require('../../../../src/shared/errors');

function makePosition(over = {}) {
  return new Position({
    brokerId: 'broker1',
    assetType: 'stock',
    symbol: 'AAPL',
    quantity: 100,
    averageCost: 150,
    currency: 'USD',
    ...over,
  });
}

function build({ position = makePosition(), thresholdSetting, settingsError } = {}) {
  const positionRepository = {
    findById: jest.fn().mockResolvedValue(position),
    update: jest.fn().mockImplementation(async (p) => p),
  };
  const settingsRepository = {
    get: settingsError
      ? jest.fn().mockRejectedValue(new Error('settings down'))
      : jest.fn().mockResolvedValue(thresholdSetting !== undefined ? thresholdSetting : null),
  };
  const auditRepository = { append: jest.fn().mockResolvedValue(undefined) };
  const updatePosition = new UpdatePosition({ positionRepository, auditRepository });
  const useCase = new GuardedUpdatePosition({ updatePosition, positionRepository, settingsRepository });
  return { useCase, positionRepository, settingsRepository, auditRepository };
}

describe('GuardedUpdatePosition', () => {
  it('applies an under-threshold quantity change and audits it with source mcp', async () => {
    const { useCase, auditRepository } = build();
    const result = await useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 120 });

    expect(result.quantity).toBe(120);
    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'update_position',
      targetId: 'broker1/stock__AAPL',
      source: 'mcp',
      confirmationUsed: false,
      changes: [{ field: 'quantity', old: 100, new: 120 }],
    }));
  });

  it('rejects an over-threshold change without confirm, stating magnitude, threshold, and remedy', async () => {
    const { useCase, positionRepository } = build();
    const attempt = useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 10 });

    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 10 }))
      .rejects.toThrow(/90% change.*50% confirmation threshold.*confirm: true/s);
    expect(positionRepository.update).not.toHaveBeenCalled();
  });

  it('applies the same over-threshold change with confirm: true and audits confirmationUsed', async () => {
    const { useCase, auditRepository } = build();
    const result = await useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 10, confirm: true });

    expect(result.quantity).toBe(10);
    expect(auditRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationUsed: true, source: 'mcp' })
    );
  });

  it('always requires confirm for a reduction to zero, even with a lax threshold', async () => {
    const { useCase } = build({ thresholdSetting: '100' });
    await expect(useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 0 }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it('preserves the stored averageCost when the patch sends it as null (FR-002)', async () => {
    const { useCase, positionRepository } = build();
    const result = await useCase.execute({
      brokerId: 'broker1', rowKey: 'stock__AAPL', averageCost: null, notes: 'updated',
    });

    expect(result.averageCost).toBe(150);
    expect(result.notes).toBe('updated');
    expect(positionRepository.update).toHaveBeenCalled();
  });

  it('skips the guard entirely for non-quantity patches (no findById double-read needed)', async () => {
    const { useCase, settingsRepository } = build();
    await useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', notes: 'note only' });
    expect(settingsRepository.get).not.toHaveBeenCalled();
  });

  it('falls back to the 50% default when the threshold setting is invalid or unreadable', async () => {
    for (const opts of [{ thresholdSetting: 'abc' }, { thresholdSetting: '0' }, { thresholdSetting: '250' }, { settingsError: true }]) {
      const { useCase } = build(opts);
      // 40% change: allowed under default 50 — proves fallback is 50, not "off" or the bad value.
      await expect(useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 60 }))
        .resolves.toMatchObject({ quantity: 60 });
      await expect(useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 10 }))
        .rejects.toBeInstanceOf(DomainError);
    }
  });

  it('honors a custom threshold from settings', async () => {
    const { useCase } = build({ thresholdSetting: '10' });
    await expect(useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 120 }))
      .rejects.toThrow(/10% confirmation threshold/);
  });

  it('throws NotFoundError for a quantity change on a missing position', async () => {
    const { useCase, positionRepository } = build();
    positionRepository.findById.mockResolvedValue(null);
    await expect(useCase.execute({ brokerId: 'broker1', rowKey: 'stock__NOPE', quantity: 5 }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('surfaces the same domain validation as the dashboard path (negative quantity)', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: -5, confirm: true }))
      .rejects.toThrow(/[Qq]uantity/);
  });
});
