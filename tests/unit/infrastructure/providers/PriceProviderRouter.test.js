/**
 * PriceProviderRouter Tests
 */

const PriceProviderRouter = require('../../../../src/infrastructure/providers/PriceProviderRouter');

describe('PriceProviderRouter', () => {
  const yahoo = { name: 'yahoo' };
  const rava = { name: 'rava' };

  describe('with both providers registered', () => {
    const router = new PriceProviderRouter({ yahoo, rava });

    it('routes ARS-denominated bonds to Rava', () => {
      expect(router.pickFor({ assetType: 'bond', currency: 'ARS' })).toBe(rava);
    });

    it('routes ARS bopreal/lecap/on to Rava', () => {
      expect(router.pickFor({ assetType: 'bopreal', currency: 'ARS' })).toBe(rava);
      expect(router.pickFor({ assetType: 'lecap', currency: 'ARS' })).toBe(rava);
      expect(router.pickFor({ assetType: 'on', currency: 'ARS' })).toBe(rava);
    });

    it('routes USD-denominated bonds to Yahoo (default)', () => {
      expect(router.pickFor({ assetType: 'bond', currency: 'USD' })).toBe(yahoo);
    });

    it('routes stocks/etfs/cedears to Yahoo regardless of currency', () => {
      expect(router.pickFor({ assetType: 'stock', currency: 'ARS' })).toBe(yahoo);
      expect(router.pickFor({ assetType: 'etf', currency: 'USD' })).toBe(yahoo);
      expect(router.pickFor({ assetType: 'cedear', currency: 'ARS' })).toBe(yahoo);
    });

    it('returns the default for null position', () => {
      expect(router.pickFor(null)).toBe(yahoo);
    });
  });

  describe('without Rava registered', () => {
    const router = new PriceProviderRouter({ yahoo });

    it('falls back to Yahoo for ARS bonds when Rava unavailable', () => {
      expect(router.pickFor({ assetType: 'bond', currency: 'ARS' })).toBe(yahoo);
    });
  });

  describe('without any providers', () => {
    it('returns undefined as default when no providers registered', () => {
      const router = new PriceProviderRouter({});
      expect(router.pickFor({ assetType: 'bond', currency: 'ARS' })).toBeUndefined();
    });
  });
});
