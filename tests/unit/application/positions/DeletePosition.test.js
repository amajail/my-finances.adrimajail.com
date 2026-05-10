/**
 * DeletePosition Use Case Tests
 */

const DeletePosition = require('../../../../src/application/use-cases/positions/DeletePosition');
const { ValidationError, NotFoundError } = require('../../../../src/shared/errors');

describe('DeletePosition Use Case', () => {
  it('should delete a position', async () => {
    const mockRepository = {
      delete: jest.fn().mockResolvedValue(true)
    };

    const useCase = new DeletePosition({ positionRepository: mockRepository });
    const result = await useCase.execute({
      brokerId: 'broker1',
      rowKey: 'stock__AAPL'
    });

    expect(result.deleted).toBe(true);
    expect(mockRepository.delete).toHaveBeenCalledWith('broker1', 'stock__AAPL');
  });

  it('should throw NotFoundError when position does not exist', async () => {
    const mockRepository = {
      delete: jest.fn().mockResolvedValue(false)
    };

    const useCase = new DeletePosition({ positionRepository: mockRepository });

    await expect(useCase.execute({
      brokerId: 'broker1',
      rowKey: 'stock__AAPL'
    }))
      .rejects
      .toThrow(NotFoundError);
  });

  it('should throw ValidationError when brokerId is missing', async () => {
    const mockRepository = {
      delete: jest.fn()
    };

    const useCase = new DeletePosition({ positionRepository: mockRepository });

    await expect(useCase.execute({
      rowKey: 'stock__AAPL'
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should throw ValidationError when rowKey is missing', async () => {
    const mockRepository = {
      delete: jest.fn()
    };

    const useCase = new DeletePosition({ positionRepository: mockRepository });

    await expect(useCase.execute({
      brokerId: 'broker1'
    }))
      .rejects
      .toThrow(ValidationError);
  });
});
