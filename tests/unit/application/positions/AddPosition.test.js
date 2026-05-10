/**
 * AddPosition Use Case Tests
 */

const AddPosition = require('../../../../src/application/use-cases/positions/AddPosition');
const Broker = require('../../../../src/domain/entities/Broker');
const { ValidationError, NotFoundError } = require('../../../../src/shared/errors');

describe('AddPosition Use Case', () => {
  it('should add a position when broker exists', async () => {
    const broker = new Broker({
      id: 'galicia',
      displayName: 'Galicia',
      type: 'broker'
    });

    const mockBrokerRepo = {
      findById: jest.fn().mockResolvedValue(broker)
    };

    const mockPositionRepo = {
      save: jest.fn().mockImplementation(pos => Promise.resolve(pos))
    };

    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo
    });

    const result = await useCase.execute({
      brokerId: 'galicia',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD'
    });

    expect(result.symbol).toBe('AAPL');
    expect(result.quantity).toBe(10);
    expect(mockPositionRepo.save).toHaveBeenCalled();
  });

  it('should throw NotFoundError when broker does not exist', async () => {
    const mockBrokerRepo = {
      findById: jest.fn().mockResolvedValue(null)
    };

    const mockPositionRepo = {
      save: jest.fn()
    };

    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo
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
    const mockBrokerRepo = {
      findById: jest.fn()
    };

    const mockPositionRepo = {
      save: jest.fn()
    };

    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo
    });

    await expect(useCase.execute({
      brokerId: 'galicia'
      // missing assetType, symbol, etc.
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should include optional fields when provided', async () => {
    const broker = new Broker({
      id: 'iol',
      displayName: 'IOL',
      type: 'broker'
    });

    const mockBrokerRepo = {
      findById: jest.fn().mockResolvedValue(broker)
    };

    const mockPositionRepo = {
      save: jest.fn().mockImplementation(pos => Promise.resolve(pos))
    };

    const useCase = new AddPosition({
      brokerRepository: mockBrokerRepo,
      positionRepository: mockPositionRepo
    });

    await useCase.execute({
      brokerId: 'iol',
      assetType: 'bond',
      symbol: 'AE38',
      quantity: 100,
      averageCost: 95.5,
      currency: 'ARS',
      displayName: 'Bond AE38',
      exchange: 'BCBA',
      notes: 'Test bond'
    });

    expect(mockPositionRepo.save).toHaveBeenCalled();
  });
});
