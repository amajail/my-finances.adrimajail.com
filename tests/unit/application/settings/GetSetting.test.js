/**
 * GetSetting Use Case Tests
 */

const GetSetting = require('../../../../src/application/use-cases/settings/GetSetting');
const { ValidationError } = require('../../../../src/shared/errors');

describe('GetSetting Use Case', () => {
  it('should get a setting', async () => {
    const mockRepository = {
      get: jest.fn().mockResolvedValue('1000')
    };

    const useCase = new GetSetting({ settingsRepository: mockRepository });
    const result = await useCase.execute({ key: 'mep_rate' });

    expect(result.key).toBe('mep_rate');
    expect(result.value).toBe('1000');
    expect(mockRepository.get).toHaveBeenCalledWith('mep_rate');
  });

  it('should return null value when setting not found', async () => {
    const mockRepository = {
      get: jest.fn().mockResolvedValue(null)
    };

    const useCase = new GetSetting({ settingsRepository: mockRepository });
    const result = await useCase.execute({ key: 'nonexistent' });

    expect(result.key).toBe('nonexistent');
    expect(result.value).toBeNull();
  });

  it('should throw ValidationError when key is missing', async () => {
    const mockRepository = {
      get: jest.fn()
    };

    const useCase = new GetSetting({ settingsRepository: mockRepository });

    await expect(useCase.execute({}))
      .rejects
      .toThrow(ValidationError);
  });

  it('should handle repository errors gracefully', async () => {
    const mockRepository = {
      get: jest.fn().mockRejectedValue(new Error('Database error'))
    };

    const useCase = new GetSetting({ settingsRepository: mockRepository });
    const result = await useCase.execute({ key: 'test_key' });

    expect(result.key).toBe('test_key');
    expect(result.value).toBeNull();
  });
});
