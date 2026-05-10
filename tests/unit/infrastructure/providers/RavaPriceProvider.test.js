/**
 * RavaPriceProvider Tests
 */

const RavaPriceProvider = require('../../../../src/infrastructure/providers/RavaPriceProvider');
const { ValidationError, InfrastructureError } = require('../../../../src/shared/errors');

function mockResponse({ ok = true, status = 200, body = '' } = {}) {
  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(body)
  };
}

describe('RavaPriceProvider', () => {
  describe('name property', () => {
    it('should return "rava"', () => {
      const provider = new RavaPriceProvider({ fetcher: jest.fn() });
      expect(provider.name).toBe('rava');
    });
  });

  describe('getQuote', () => {
    it('should throw ValidationError when symbol is missing', async () => {
      const provider = new RavaPriceProvider({ fetcher: jest.fn() });
      await expect(provider.getQuote({ assetType: 'bond' }))
        .rejects.toThrow(ValidationError);
    });

    it('should fetch and parse a JSON-embedded ultimo (Argentine notation)', async () => {
      const html = `<html><script>var data = {"ultimo":"1.234,56","cambio":"+0,5"};</script></html>`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new RavaPriceProvider({ fetcher, baseUrl: 'https://example.test/perfil' });

      const result = await provider.getQuote({ symbol: 'AL30', assetType: 'bond', currency: 'ARS' });

      expect(result.price).toBeCloseTo(1234.56, 2);
      expect(result.currency).toBe('ARS');
      expect(result.providerSymbol).toBe('AL30');
      expect(fetcher).toHaveBeenCalledWith(
        'https://example.test/perfil/AL30',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should fetch and parse a JSON-embedded ultimo (plain number)', async () => {
      const html = `<script>{"ultimo": 150.25}</script>`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new RavaPriceProvider({ fetcher });

      const result = await provider.getQuote({ symbol: 'GD30', assetType: 'bond', currency: 'ARS' });

      expect(result.price).toBeCloseTo(150.25, 2);
      expect(result.providerSymbol).toBe('GD30');
    });

    it('should fall back to data-ultimo attribute', async () => {
      const html = `<div data-ultimo="987,65" class="quote"></div>`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new RavaPriceProvider({ fetcher });

      const result = await provider.getQuote({ symbol: 'TZX26', assetType: 'bond', currency: 'ARS' });

      expect(result.price).toBeCloseTo(987.65, 2);
    });

    it('should strip .BA suffix from the symbol', async () => {
      const html = `{"ultimo":100}`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new RavaPriceProvider({ fetcher, baseUrl: 'https://example.test/perfil' });

      const result = await provider.getQuote({ symbol: 'AL30.BA', assetType: 'bond', currency: 'ARS' });

      expect(result.providerSymbol).toBe('AL30');
      expect(fetcher).toHaveBeenCalledWith('https://example.test/perfil/AL30', expect.any(Object));
    });

    it('should default currency to ARS when not provided', async () => {
      const html = `{"ultimo":100}`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new RavaPriceProvider({ fetcher });

      const result = await provider.getQuote({ symbol: 'AL30', assetType: 'bond' });

      expect(result.currency).toBe('ARS');
    });

    it('should throw InfrastructureError when HTTP response is not ok', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ ok: false, status: 503 }));
      const provider = new RavaPriceProvider({ fetcher });

      await expect(provider.getQuote({ symbol: 'AL30', assetType: 'bond', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when fetch rejects', async () => {
      const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = new RavaPriceProvider({ fetcher });

      await expect(provider.getQuote({ symbol: 'AL30', assetType: 'bond', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when no price can be extracted', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: '<html>nothing here</html>' }));
      const provider = new RavaPriceProvider({ fetcher });

      await expect(provider.getQuote({ symbol: 'AL30', assetType: 'bond', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when extracted price is not positive', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: '{"ultimo":0}' }));
      const provider = new RavaPriceProvider({ fetcher });

      await expect(provider.getQuote({ symbol: 'AL30', assetType: 'bond', currency: 'ARS' }))
        .rejects.toThrow(InfrastructureError);
    });
  });

  describe('parseArNumber helper', () => {
    const parse = RavaPriceProvider._parseArNumber;

    it('parses Argentine notation', () => {
      expect(parse('1.234,56')).toBeCloseTo(1234.56, 2);
      expect(parse('150,75')).toBeCloseTo(150.75, 2);
      expect(parse('1.000.000,00')).toBeCloseTo(1000000, 2);
    });

    it('parses plain JSON-style numbers', () => {
      expect(parse('1234.56')).toBeCloseTo(1234.56, 2);
      expect(parse('150')).toBe(150);
    });

    it('returns NaN for empty/invalid input', () => {
      expect(parse('')).toBeNaN();
      expect(parse(null)).toBeNaN();
      expect(parse(undefined)).toBeNaN();
    });
  });
});
