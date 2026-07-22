/**
 * AddPosition Use Case Tests
 */

const AddPosition = require('../../../../src/application/use-cases/positions/AddPosition');
const Broker = require('../../../../src/domain/entities/Broker');
const Position = require('../../../../src/domain/entities/Position');
const { ValidationError, NotFoundError, DomainError } = require('../../../../src/shared/errors');

function mockBrokerRepo(broker = new Broker({ id: 'broker1', displayName: 'Galicia', type: 'broker' })) {
  return { findById: jest.fn().mockResolvedValue(broker) };
}

function mockPositionRepo({ existing = null } = {}) {
  return {
    findById: jest.fn().mockResolvedValue(existing),
    save: jest.fn().mockImplementation((pos) => Promise.resolve(pos)),
  };
}

describe('AddPosition Use Case', () => {
  it('should add a position when broker exists', async () => {
    const mockPosRepo = mockPositionRepo();
    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo(),
      positionRepository: mockPosRepo
    });

    const result = await useCase.execute({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD'
    });

    expect(result.symbol).toBe('AAPL');
    expect(result.quantity).toBe(10);
    expect(mockPosRepo.save).toHaveBeenCalled();
  });

  it('should throw NotFoundError when broker does not exist', async () => {
    const useCase = new AddPosition({
      brokerRepository: { findById: jest.fn().mockResolvedValue(null) },
      positionRepository: mockPositionRepo()
    });

    await expect(useCase.execute({
      brokerId: 'nonexistent',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD'
    }))
      .rejects
      .toThrow(NotFoundError);
  });

  it('should throw ValidationError when required fields are missing', async () => {
    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo(),
      positionRepository: mockPositionRepo()
    });

    await expect(useCase.execute({
      brokerId: 'broker1'
      // missing assetType, symbol, etc.
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should include optional fields when provided', async () => {
    const mockPosRepo = mockPositionRepo();
    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo(new Broker({ id: 'broker2', displayName: 'IOL', type: 'broker' })),
      positionRepository: mockPosRepo
    });

    await useCase.execute({
      brokerId: 'broker2',
      assetType: 'bond',
      symbol: 'AE38',
      quantity: 100,
      averageCost: 95.5,
      currency: 'ARS',
      displayName: 'Bond AE38',
      exchange: 'BCBA',
      notes: 'Test bond'
    });

    expect(mockPosRepo.save).toHaveBeenCalled();
  });
});

describe('AddPosition — duplicate rejection + audit (feature 018)', () => {
  function existingPosition(over = {}) {
    return new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD',
      ...over,
    });
  }

  const validInput = {
    brokerId: 'broker1',
    assetType: 'stock',
    symbol: 'AAPL',
    quantity: 5,
    averageCost: 100,
    currency: 'USD',
  };

  it('rejects a duplicate of an existing open position, pointing at the record (FR-009)', async () => {
    const mockPosRepo = mockPositionRepo({ existing: existingPosition() });
    const useCase = new AddPosition({ brokerRepository: mockBrokerRepo(), positionRepository: mockPosRepo });

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(DomainError);
    await expect(useCase.execute(validInput)).rejects.toThrow(/broker1\/stock__AAPL.*update_position/s);
    expect(mockPosRepo.save).not.toHaveBeenCalled();
    expect(mockPosRepo.findById).toHaveBeenCalledWith('broker1', 'stock__AAPL');
  });

  it('rejects creation over a closed position with a reopen hint (row key is occupied)', async () => {
    const mockPosRepo = mockPositionRepo({ existing: existingPosition({ status: 'closed' }) });
    const useCase = new AddPosition({ brokerRepository: mockBrokerRepo(), positionRepository: mockPosRepo });

    await expect(useCase.execute(validInput)).rejects.toThrow(/closed position.*[Rr]eopen/s);
    expect(mockPosRepo.save).not.toHaveBeenCalled();
  });

  it('appends an audit entry on creation with old: null for every provided field', async () => {
    const auditRepository = { append: jest.fn().mockResolvedValue(undefined) };
    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo(),
      positionRepository: mockPositionRepo(),
      auditRepository,
    });

    await useCase.execute({ ...validInput, _audit: { source: 'mcp' } });

    expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'create_position',
      targetType: 'position',
      targetId: 'broker1/stock__AAPL',
      source: 'mcp',
      changes: expect.arrayContaining([
        { field: 'quantity', old: null, new: 5 },
        { field: 'averageCost', old: null, new: 100 },
      ]),
    }));
  });

  it('still succeeds when the audit append fails, and works without an auditRepository', async () => {
    const failingAudit = { append: jest.fn().mockRejectedValue(new Error('audit down')) };
    const withAudit = new AddPosition({
      brokerRepository: mockBrokerRepo(),
      positionRepository: mockPositionRepo(),
      auditRepository: failingAudit,
    });
    await expect(withAudit.execute(validInput)).resolves.toMatchObject({ symbol: 'AAPL' });

    const withoutAudit = new AddPosition({
      brokerRepository: mockBrokerRepo(),
      positionRepository: mockPositionRepo(),
    });
    await expect(withoutAudit.execute(validInput)).resolves.toMatchObject({ symbol: 'AAPL' });
  });
});
