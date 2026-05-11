/**
 * IOLPriceProvider Tests
 */

const IOLPriceProvider = require('../../../../src/infrastructure/providers/IOLPriceProvider');
const { ValidationError, InfrastructureError } = require('../../../../src/shared/errors');

function mockResponse({ ok = true, status = 200, body = '' } = {}) {
  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(body)
  };
}

const headerBlockUSD = (price = '81,32') => `
  <span id="IdTitulo" data-field="IDTitulo" class="fontsize18">
    <span>US$</span>
    <span data-field="UltimoPrecio">${price}</span>
  </span>
`;

const headerBlockARS = (price = '115.710,00') => `
  <span id="IdTitulo" data-field="IDTitulo" class="fontsize18">
    <span>$</span>
    <span data-field="UltimoPrecio">${price}</span>
  </span>
`;

describe('IOLPriceProvider', () => {
  describe('name property', () => {
    it('should return "iol"', () => {
      const provider = new IOLPriceProvider({ fetcher: jest.fn() });
      expect(provider.name).toBe('iol');
    });
  });

  describe('getQuote', () => {
    const baseUrl = 'https://example.test/titulo/cotizacion';

    it('should throw ValidationError when symbol is missing', async () => {
      const provider = new IOLPriceProvider({ fetcher: jest.fn() });
      await expect(provider.getQuote({ assetType: 'bond' }))
        .rejects.toThrow(ValidationError);
    });

    it('should parse last price from the IdTitulo header anchor (USD)', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockUSD('81,32') }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'GD35D', assetType: 'bond', currency: 'USD' });

      expect(result.price).toBeCloseTo(81.32, 2);
      expect(result.currency).toBe('USD');
      expect(result.providerSymbol).toBe('GD35D');
    });

    it('should parse Argentine-notation thousands (ARS)', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockARS('115.710,00') }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'GD35', assetType: 'bond', currency: 'ARS' });

      expect(result.price).toBeCloseTo(115710, 2);
      expect(result.currency).toBe('ARS');
    });

    it('should infer USD currency from the US$ prefix when caller omits currency', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockUSD('80,00') }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'GD35D', assetType: 'bond' });

      expect(result.currency).toBe('USD');
    });

    it('should infer ARS currency from the plain $ prefix when caller omits currency', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockARS('100,00') }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'GD35', assetType: 'bond' });

      expect(result.currency).toBe('ARS');
    });

    it('should default exchange path to BCBA when not provided', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockUSD() }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      await provider.getQuote({ symbol: 'GD35D', assetType: 'bond', currency: 'USD' });

      expect(fetcher).toHaveBeenCalledWith(
        'https://example.test/titulo/cotizacion/BCBA/GD35D/',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should use the provided exchange in the URL path', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockARS() }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      await provider.getQuote({ symbol: 'GD35', assetType: 'bond', currency: 'ARS', exchange: 'MAE' });

      expect(fetcher).toHaveBeenCalledWith(
        'https://example.test/titulo/cotizacion/MAE/GD35/',
        expect.any(Object)
      );
    });

    it('should strip .BA suffix from the symbol', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockARS() }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'GD35.BA', assetType: 'bond', currency: 'ARS' });

      expect(result.providerSymbol).toBe('GD35');
      expect(fetcher).toHaveBeenCalledWith(
        'https://example.test/titulo/cotizacion/BCBA/GD35/',
        expect.any(Object)
      );
    });

    it('should fall back to the first UltimoPrecio span when no IdTitulo header', async () => {
      const html = `<table><tr><td><span data-field="UltimoPrecio">42,50</span></td></tr></table>`;
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: html }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      const result = await provider.getQuote({ symbol: 'BPOC7', assetType: 'bopreal', currency: 'USD' });

      expect(result.price).toBeCloseTo(42.5, 2);
    });

    it('should throw InfrastructureError when HTTP response is not ok', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ ok: false, status: 503 }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'GD35D', assetType: 'bond', currency: 'USD' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when fetch rejects', async () => {
      const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'GD35D', assetType: 'bond', currency: 'USD' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when no price can be extracted', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: '<html>nothing here</html>' }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'GD35D', assetType: 'bond', currency: 'USD' }))
        .rejects.toThrow(InfrastructureError);
    });

    it('should throw InfrastructureError when extracted price is not positive', async () => {
      const fetcher = jest.fn().mockResolvedValue(mockResponse({ body: headerBlockUSD('0,00') }));
      const provider = new IOLPriceProvider({ fetcher, baseUrl });

      await expect(provider.getQuote({ symbol: 'GD35D', assetType: 'bond', currency: 'USD' }))
        .rejects.toThrow(InfrastructureError);
    });
  });
});
