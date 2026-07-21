/**
 * UpdatePosition Use Case Tests
 */

const UpdatePosition = require('../../../../src/application/use-cases/positions/UpdatePosition');
const Position = require('../../../../src/domain/entities/Position');
const { ValidationError, NotFoundError } = require('../../../../src/shared/errors');

describe('UpdatePosition Use Case', () => {
  it('should update a position', async () => {
    const position = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD',
      currentPrice: 160
    });

    const mockRepository = {
      findById: jest.fn().mockResolvedValue(position),
      update: jest.fn().mockResolvedValue(position)
    };

    const useCase = new UpdatePosition({ positionRepository: mockRepository });
    const result = await useCase.execute({
      brokerId: 'broker1',
      rowKey: 'stock__AAPL',
      currentPrice: 165
    });

    expect(result.currentPrice).toBe(165);
    expect(mockRepository.update).toHaveBeenCalled();
  });

  it('should throw NotFoundError when position does not exist', async () => {
    const mockRepository = {
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn()
    };

    const useCase = new UpdatePosition({ positionRepository: mockRepository });

    await expect(useCase.execute({
      brokerId: 'broker1',
      rowKey: 'stock__AAPL',
      currentPrice: 165
    }))
      .rejects
      .toThrow(NotFoundError);
  });

  it('should throw ValidationError when brokerId is missing', async () => {
    const mockRepository = {
      findById: jest.fn(),
      update: jest.fn()
    };

    const useCase = new UpdatePosition({ positionRepository: mockRepository });

    await expect(useCase.execute({
      rowKey: 'stock__AAPL',
      currentPrice: 165
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should throw ValidationError when rowKey is missing', async () => {
    const mockRepository = {
      findById: jest.fn(),
      update: jest.fn()
    };

    const useCase = new UpdatePosition({ positionRepository: mockRepository });

    await expect(useCase.execute({
      brokerId: 'broker1',
      currentPrice: 165
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should update multiple fields', async () => {
    const position = new Position({
      brokerId: 'broker2',
      assetType: 'stock',
      symbol: 'TSLA',
      quantity: 5,
      averageCost: 200,
      currency: 'USD',
      status: 'open'
    });

    const mockRepository = {
      findById: jest.fn().mockResolvedValue(position),
      update: jest.fn().mockResolvedValue(position)
    };

    const useCase = new UpdatePosition({ positionRepository: mockRepository });
    await useCase.execute({
      brokerId: 'broker2',
      rowKey: 'stock__TSLA',
      quantity: 10,
      currentPrice: 250,
      notes: 'Updated position'
    });

    expect(mockRepository.update).toHaveBeenCalled();
  });
});

describe('UpdatePosition — audit trail (feature 018)', () => {
  function build({ auditRepository } = {}) {
    const position = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD',
    });
    const mockRepository = {
      findById: jest.fn().mockResolvedValue(position),
      update: jest.fn().mockImplementation(async (p) => p),
    };
    const useCase = new UpdatePosition({ positionRepository: mockRepository, auditRepository });
    return { useCase, mockRepository };
  }

  it('appends an audit entry with field-level old/new for changed fields only', async () => {
    const auditRepository = { append: jest.fn().mockResolvedValue(undefined) };
    const { useCase } = build({ auditRepository });

    await useCase.execute({
      brokerId: 'broker1',
      rowKey: 'stock__AAPL',
      quantity: 12,
      averageCost: 150, // unchanged — must NOT appear in changes
      _audit: { source: 'mcp', confirmationUsed: true },
    });

    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'update_position',
      targetType: 'position',
      targetId: 'broker1/stock__AAPL',
      source: 'mcp',
      confirmationUsed: true,
      changes: [{ field: 'quantity', old: 10, new: 12 }],
    }));
  });

  it('defaults the audit source to api when no context is passed (dashboard path)', async () => {
    const auditRepository = { append: jest.fn().mockResolvedValue(undefined) };
    const { useCase } = build({ auditRepository });
    await useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', notes: 'hola' });
    expect(auditRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'api', confirmationUsed: false })
    );
  });

  it('still succeeds when the audit append fails', async () => {
    const auditRepository = { append: jest.fn().mockRejectedValue(new Error('audit down')) };
    const { useCase, mockRepository } = build({ auditRepository });
    const result = await useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 12 });
    expect(result.quantity).toBe(12);
    expect(mockRepository.update).toHaveBeenCalled();
  });

  it('works without an auditRepository (backward compatible)', async () => {
    const { useCase } = build();
    const result = await useCase.execute({ brokerId: 'broker1', rowKey: 'stock__AAPL', quantity: 12 });
    expect(result.quantity).toBe(12);
  });
});
