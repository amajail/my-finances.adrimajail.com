/**
 * PriceProviderRouter Tests
 */

const PriceProviderRouter = require('../../../../src/infrastructure/providers/PriceProviderRouter');

describe('PriceProviderRouter', () => {
  const yahoo = { name: 'yahoo' };
  const cohen = { name: 'cohen' };
  const iol = { name: 'iol' };

  describe('with all three providers registered', () => {
    const router = new PriceProviderRouter({ yahoo, cohen, iol });

    it('chains ARS bonds: iol → cohen → yahoo', () => {
      expect(router.chainFor({ assetType: 'bond', currency: 'ARS' })).toEqual([iol, cohen, yahoo]);
    });

    it('chains ARS bopreal/lecap/on the same way', () => {
      expect(router.chainFor({ assetType: 'bopreal', currency: 'ARS' })).toEqual([iol, cohen, yahoo]);
      expect(router.chainFor({ assetType: 'lecap', currency: 'ARS' })).toEqual([iol, cohen, yahoo]);
      expect(router.chainFor({ assetType: 'on', currency: 'ARS' })).toEqual([iol, cohen, yahoo]);
    });

    it('chains USD bonds: iol → yahoo (Cohen skipped — ARS-only)', () => {
      expect(router.chainFor({ assetType: 'bond', currency: 'USD' })).toEqual([iol, yahoo]);
      expect(router.chainFor({ assetType: 'bopreal', currency: 'USD' })).toEqual([iol, yahoo]);
    });

    it('routes stocks/etfs/cedears directly to Yahoo only', () => {
      expect(router.chainFor({ assetType: 'stock', currency: 'ARS' })).toEqual([yahoo]);
      expect(router.chainFor({ assetType: 'etf', currency: 'USD' })).toEqual([yahoo]);
      expect(router.chainFor({ assetType: 'cedear', currency: 'ARS' })).toEqual([yahoo]);
    });

    it('returns [default] for null position', () => {
      expect(router.chainFor(null)).toEqual([yahoo]);
    });
  });

  describe('without IOL registered', () => {
    const router = new PriceProviderRouter({ yahoo, cohen });

    it('ARS bond chain degrades to [cohen, yahoo]', () => {
      expect(router.chainFor({ assetType: 'bond', currency: 'ARS' })).toEqual([cohen, yahoo]);
    });

    it('USD bond chain degrades to [yahoo] only', () => {
      expect(router.chainFor({ assetType: 'bond', currency: 'USD' })).toEqual([yahoo]);
    });
  });

  describe('without Cohen registered', () => {
    const router = new PriceProviderRouter({ yahoo, iol });

    it('ARS bond chain is [iol, yahoo]', () => {
      expect(router.chainFor({ assetType: 'bond', currency: 'ARS' })).toEqual([iol, yahoo]);
    });
  });

  describe('without any providers', () => {
    it('returns an empty chain when no providers are registered', () => {
      const router = new PriceProviderRouter({});
      expect(router.chainFor({ assetType: 'bond', currency: 'ARS' })).toEqual([]);
    });
  });
});
