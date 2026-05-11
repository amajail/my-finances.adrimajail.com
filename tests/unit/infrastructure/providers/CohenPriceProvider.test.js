/**
 * CohenPriceProvider Tests
 */

const CohenPriceProvider = require('../../../../src/infrastructure/providers/CohenPriceProvider');
const { ValidationError, InfrastructureError } = require('../../../../src/shared/errors');

function mockResponse({ ok = true, status = 200, body = '' } = {}) {
  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(body)
  };
}

const inlineJson = ({ ultimo = 149500.0, moneda = '$' } = {}) =>
  `<html><script>var data = {"PrecioUltimo":${ultimo},"PrecioApertura":${ultimo},"PrecioMaximo":0,"PrecioMinimo":0,"Moneda":"${moneda}","Simbolo":"XMC1O"};</script></html>`;

describe('CohenPriceProvider', () => {
  describe('name property', () => {
    it('should return "cohen"', () => {
      const provider = new CohenPriceProvider({ fetcher: jest.fn() });
      expect(provider.name).toBe('cohen');
    });
  });

  describe('getQuote', () => {
    const baseUrl = 'https://example.test/Bursatil/Especie';

    it('should throw ValidationError when symbol is missing', async () => {
      const provider = new CohenPriceProvider({ fetcher: jest.fn() });
      await expect(provider.getQuote({ assetType: 'on' }))
        .rejects.toThrow(ValidationError);
    });

    it('should parse PrecioUltimo from inline JSON (ARS)', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: inlineJson({ ultimo: 149500.0, moneda: '$' }) }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'XMC1O', assetType: 'on', currency: 'ARS' });

      expect(result.price).toBeCloseTo(149500, 2);
      expect(result.currency).toBe('ARS');
      expect(result.providerSymbol).toBe('XMC1O');
      expect(fetcher).toHaveBeenCalledWith(
        'https://example.test/Bursatil/Especie/XMC1O',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should infer ARS currency from "$" Moneda when caller omits currency', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: inlineJson({ ultimo: 120000, moneda: '$' }) }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'XMC1O', assetType: 'on' });

      expect(result.currency).toBe('ARS');
    });

    it('should infer USD currency from "U$S" Moneda when caller omits currency', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: inlineJson({ ultimo: 80.5, moneda: 'U$S' }) }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'GD35D', assetType: 'bond' });

      expect(result.currency).toBe('USD');
      expect(result.price).toBeCloseTo(80.5, 2);
    });

    it('should strip .BA suffix from the symbol', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: inlineJson() }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'AL30.BA', assetType: 'bond', currency: 'ARS' });

      expect(result.providerSymbol).toBe('AL30');
      expect(fetcher).toHaveBeenCalledWith(
        'https://example.test/Bursatil/Especie/AL30',
        expect.any(Object)
      );
    });

    it('should default currency to ARS when neither caller nor page indicate currency', async () => {
      const html = `<html>{"PrecioUltimo":100.0}</html>`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'XMC1O', assetType: 'on' });

      expect(result.currency).toBe('ARS');
    });

    it('should parse Argentine-notation numbers as a fallback', async () => {
      const html = `<html>{"PrecioUltimo":"1.234,56","Moneda":"$"}</html>`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'XMC1O', assetType: 'on' });

      expect(result.price).toBeCloseTo(1234.56, 2);
    });

    it('should throw InfrastructureError when HTTP response is not ok', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ ok: false, status: 503 }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'XMC1O', assetType: 'on', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when fetch rejects', async () => {
      const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'XMC1O', assetType: 'on', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when no price can be extracted', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: '<html>nothing here</html>' }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'XMC1O', assetType: 'on', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when extracted price is not positive', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: inlineJson({ ultimo: 0 }) }));
      const provider = new CohenPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'XMC1O', assetType: 'on', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });
  });
});
