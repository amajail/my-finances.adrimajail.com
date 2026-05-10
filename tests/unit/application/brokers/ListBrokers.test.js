/**
 * ListBrokers Use Case Tests
 */

const ListBrokers = require('../../../../src/application/use-cases/brokers/ListBrokers');
const Broker = require('../../../../src/domain/entities/Broker');

describe('ListBrokers Use Case', () => {
  it('should list all brokers', async () => {
    const broker1 = new Broker({
      id: 'galicia',
      displayName: 'Galicia',
      type: 'broker'
    });
    const broker2 = new Broker({
      id: 'cash',
      displayName: 'Cash',
      type: 'cash_holder'
    });

    const mockRepository = {
      findAll: jest.fn().mockResolvedValue([broker1, broker2])
    };

    const useCase = new ListBrokers({ brokerRepository: mockRepository });
    const result = await useCase.execute({});

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('galicia');
    expect(result[1].id).toBe('cash');
    expect(mockRepository.findAll).toHaveBeenCalled();
  });

  it('should return empty array when no brokers exist', async () => {
    const mockRepository = {
      findAll: jest.fn().mockResolvedValue([])
    };

    const useCase = new ListBrokers({ brokerRepository: mockRepository });
    const result = await useCase.execute({});

    expect(result).toEqual([]);
  });

  it('should return brokers as plain objects', async () => {
    const broker = new Broker({
      id: 'iol',
      displayName: 'IOL',
      type: 'broker',
      accentColor: '#FF0000',
      notes: 'Test'
    });

    const mockRepository = {
      findAll: jest.fn().mockResolvedValue([broker])
    };

    const useCase = new ListBrokers({ brokerRepository: mockRepository });
    const result = await useCase.execute({});

    expect(result[0]).toEqual(expect.objectContaining({
      id: 'iol',
      displayName: 'IOL',
      type: 'broker',
      accentColor: '#FF0000',
      notes: 'Test'
    }));
  });
});
