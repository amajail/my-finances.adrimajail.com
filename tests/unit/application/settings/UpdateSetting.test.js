/**
 * UpdateSetting Use Case Tests
 */

const UpdateSetting = require('../../../../src/application/use-cases/settings/UpdateSetting');
const { ValidationError } = require('../../../../src/shared/errors');

describe('UpdateSetting Use Case', () => {
  it('should update a setting', async () => {
    const mockRepository = {
      set: jest.fn().mockResolvedValue(undefined)
    };

    const useCase = new UpdateSetting({ settingsRepository: mockRepository });
    const result = await useCase.execute({ key: 'mep_rate', value: '1050' });

    expect(result.key).toBe('mep_rate');
    expect(result.value).toBe('1050');
    expect(mockRepository.set).toHaveBeenCalledWith('mep_rate', '1050');
  });

  it('should throw ValidationError when key is missing', async () => {
    const mockRepository = {
      set: jest.fn()
    };

    const useCase = new UpdateSetting({ settingsRepository: mockRepository });

    await expect(useCase.execute({ value: 'test' }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should throw ValidationError when key is empty string', async () => {
    const mockRepository = {
      set: jest.fn()
    };

    const useCase = new UpdateSetting({ settingsRepository: mockRepository });

    await expect(useCase.execute({ key: '   ', value: 'test' }))
      .rejects
      .toThrow(ValidationError);
  });

  it('should allow null or undefined values', async () => {
    const mockRepository = {
      set: jest.fn().mockResolvedValue(undefined)
    };

    const useCase = new UpdateSetting({ settingsRepository: mockRepository });
    await useCase.execute({ key: 'test_key', value: null });

    expect(mockRepository.set).toHaveBeenCalledWith('test_key', null);
  });

  it('should handle various value types', async () => {
    const mockRepository = {
      set: jest.fn().mockResolvedValue(undefined)
    };

    const useCase = new UpdateSetting({ settingsRepository: mockRepository });

    // String value
    await useCase.execute({ key: 'key1', value: 'string' });
    expect(mockRepository.set).toHaveBeenCalledWith('key1', 'string');

    // Numeric value
    await useCase.execute({ key: 'key2', value: 123 });
    expect(mockRepository.set).toHaveBeenCalledWith('key2', 123);

    // Boolean value
    await useCase.execute({ key: 'key3', value: true });
    expect(mockRepository.set).toHaveBeenCalledWith('key3', true);
  });
});
