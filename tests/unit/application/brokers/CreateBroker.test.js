/**
 * CreateBroker Use Case Tests
 */

const CreateBroker = require('../../../../src/application/use-cases/brokers/CreateBroker');
const { ValidationError } = require('../../../../src/shared/errors');

describe('CreateBroker Use Case', () => {
  it('should create a broker', async () => {
    const mockRepository = {
      save: jest.fn().mockImplementation(broker => Promise.resolve(broker))
    };

    const useCase = new CreateBroker({ brokerRepository: mockRepository });
    const result = await useCase.execute({
      id: 'galicia',
      displayName: 'Galicia',
      type: 'broker',
      accentColor: '#FF0000',
      notes: 'Main broker'
    });

    expect(result.id).toBe('galicia');
    expect(result.displayName).toBe('Galicia');
    expect(result.type).toBe('broker');
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should throw ValidationError when id is missing', async () => {
    const mockRepository = {
      save: jest.fn()
    };

    const useCase = new CreateBroker({ brokerRepository: mockRepository });
    await expect(useCase.execute({
      displayName: 'Galicia',
      type: 'broker'
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should throw ValidationError when displayName is missing', async () => {
    const mockRepository = {
      save: jest.fn()
    };

    const useCase = new CreateBroker({ brokerRepository: mockRepository });
    await expect(useCase.execute({
      id: 'galicia',
      type: 'broker'
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should throw ValidationError when type is missing', async () => {
    const mockRepository = {
      save: jest.fn()
    };

    const useCase = new CreateBroker({ brokerRepository: mockRepository });
    await expect(useCase.execute({
      id: 'galicia',
      displayName: 'Galicia'
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should throw ValidationError when type is invalid', async () => {
    const mockRepository = {
      save: jest.fn()
    };

    const useCase = new CreateBroker({ brokerRepository: mockRepository });
    await expect(useCase.execute({
      id: 'galicia',
      displayName: 'Galicia',
      type: 'invalid'
    }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should create cash_holder broker', async () => {
    const mockRepository = {
      save: jest.fn().mockImplementation(broker => Promise.resolve(broker))
    };

    const useCase = new CreateBroker({ brokerRepository: mockRepository });
    const result = await useCase.execute({
      id: 'cash',
      displayName: 'Cash',
      type: 'cash_holder'
    });

    expect(result.type).toBe('cash_holder');
  });
});
