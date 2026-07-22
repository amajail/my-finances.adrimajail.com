/**
 * ListPositions Use Case Tests
 */

const ListPositions = require('../../../../src/application/use-cases/positions/ListPositions');
const Position = require('../../../../src/domain/entities/Position');

describe('ListPositions Use Case', () => {
  it('should list all positions when no filter', async () => {
    const position1 = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD'
    });

    const mockRepository = {
      findAll: jest.fn().mockResolvedValue([position1])
    };

    const useCase = new ListPositions({ positionRepository: mockRepository });
    const result = await useCase.execute({});

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('AAPL');
    expect(result[0].id).toBe('stock__AAPL');
  });

  it('should filter by status', async () => {
    const mockRepository = {
      findAll: jest.fn().mockResolvedValue([])
    };

    const useCase = new ListPositions({ positionRepository: mockRepository });
    await useCase.execute({ status: 'closed' });

    expect(mockRepository.findAll).toHaveBeenCalledWith({ status: 'closed' });
  });

  it('should filter by broker', async () => {
    const mockRepository = {
      findByBroker: jest.fn().mockResolvedValue([])
    };

    const useCase = new ListPositions({ positionRepository: mockRepository });
    await useCase.execute({ broker: 'broker1' });

    expect(mockRepository.findByBroker).toHaveBeenCalledWith('broker1');
  });

  it('should apply status filter when broker is given', async () => {
    const open = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD',
      status: 'open'
    });
    const closed = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'MSFT',
      quantity: 0,
      averageCost: 300,
      currency: 'USD',
      status: 'closed'
    });

    const mockRepository = {
      findByBroker: jest.fn().mockResolvedValue([open, closed])
    };

    const useCase = new ListPositions({ positionRepository: mockRepository });

    const openOnly = await useCase.execute({ broker: 'broker1', status: 'open' });
    expect(openOnly).toHaveLength(1);
    expect(openOnly[0].symbol).toBe('AAPL');

    const closedOnly = await useCase.execute({ broker: 'broker1', status: 'closed' });
    expect(closedOnly).toHaveLength(1);
    expect(closedOnly[0].symbol).toBe('MSFT');
  });

  it('should return all statuses for a broker when status is "all" or omitted', async () => {
    const open = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      averageCost: 150,
      currency: 'USD',
      status: 'open'
    });
    const closed = new Position({
      brokerId: 'broker1',
      assetType: 'stock',
      symbol: 'MSFT',
      quantity: 0,
      averageCost: 300,
      currency: 'USD',
      status: 'closed'
    });

    const mockRepository = {
      findByBroker: jest.fn().mockResolvedValue([open, closed])
    };

    const useCase = new ListPositions({ positionRepository: mockRepository });

    expect(await useCase.execute({ broker: 'broker1', status: 'all' })).toHaveLength(2);
    expect(await useCase.execute({ broker: 'broker1' })).toHaveLength(2);
  });

  it('should include id in returned positions', async () => {
    const position = new Position({
      brokerId: 'broker2',
      assetType: 'etf',
      symbol: 'SPY',
      quantity: 5,
      averageCost: 450,
      currency: 'USD'
    });

    const mockRepository = {
      findAll: jest.fn().mockResolvedValue([position])
    };

    const useCase = new ListPositions({ positionRepository: mockRepository });
    const result = await useCase.execute({});

    expect(result[0].id).toBe('etf__SPY');
  });
});
