/**
 * UpdatePosition Use Case Tests
 */

const UpdatePosition = require('../../../../src/application/use-cases/positions/UpdatePosition');
const Position = require('../../../../src/domain/entities/Position');
const { ValidationError, NotFoundError } = require('../../../../src/shared/errors');

describe('UpdatePosition Use Case', () => {
  it('should update a position', async () => {
    const position = new Position({
      brokerId: 'galicia',
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
      brokerId: 'galicia',
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
      brokerId: 'galicia',
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
      brokerId: 'galicia',
      currentPrice: 165
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should update multiple fields', async () => {
    const position = new Position({
      brokerId: 'iol',
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
      brokerId: 'iol',
      rowKey: 'stock__TSLA',
      quantity: 10,
      currentPrice: 250,
      notes: 'Updated position'
    });

    expect(mockRepository.update).toHaveBeenCalled();
  });
});
