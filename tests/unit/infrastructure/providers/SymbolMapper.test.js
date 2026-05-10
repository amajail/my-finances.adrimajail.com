/**
 * SymbolMapper Tests
 */

const SymbolMapper = require('../../../../src/infrastructure/providers/SymbolMapper');

describe('SymbolMapper', () => {
  describe('toYahoo', () => {
    it('should skip cash positions', () => {
      const result = SymbolMapper.toYahoo({ symbol: 'CASH', assetType: 'cash' });
      expect(result).toBeNull();
    });

    it('should skip deposit positions', () => {
      const result = SymbolMapper.toYahoo({ symbol: 'DEP', assetType: 'deposit' });
      expect(result).toBeNull();
    });

    it('should return null for empty symbol', () => {
      const result = SymbolMapper.toYahoo({ symbol: null, assetType: 'stock' });
      expect(result).toBeNull();
    });

    it('should handle US-listed stocks by NYSE exchange', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'AAPL',
        assetType: 'stock',
        exchange: 'NYSE'
      });
      expect(result).toBe('AAPL');
    });

    it('should handle US-listed stocks by NASDAQ exchange', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'MSFT',
        assetType: 'stock',
        exchange: 'NASDAQ'
      });
      expect(result).toBe('MSFT');
    });

    it('should handle US-listed stocks by currency=USD heuristic', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'TSLA',
        assetType: 'stock',
        currency: 'USD'
      });
      expect(result).toBe('TSLA');
    });

    it('should handle US-listed ETFs by currency=USD heuristic', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'SPY',
        assetType: 'etf',
        currency: 'USD'
      });
      expect(result).toBe('SPY');
    });

    it('should add .BA suffix for Argentine bonds', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'AE38',
        assetType: 'bond'
      });
      expect(result).toBe('AE38.BA');
    });

    it('should add .BA suffix for BCBA-listed stocks', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'GGAL',
        assetType: 'stock',
        exchange: 'BCBA'
      });
      expect(result).toBe('GGAL.BA');
    });

    it('should not double-append .BA suffix', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'AE38.BA',
        assetType: 'bond'
      });
      expect(result).toBe('AE38.BA');
    });

    it('should add .BA suffix for cedear', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'AAPL',
        assetType: 'cedear'
      });
      expect(result).toBe('AAPL.BA');
    });

    it('should add .BA suffix for bopreal', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'BOPREAL',
        assetType: 'bopreal'
      });
      expect(result).toBe('BOPREAL.BA');
    });

    it('should add .BA suffix for lecap', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'LECAP',
        assetType: 'lecap'
      });
      expect(result).toBe('LECAP.BA');
    });

    it('should add .BA suffix for on', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'ON',
        assetType: 'on'
      });
      expect(result).toBe('ON.BA');
    });

    it('should uppercase the symbol', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'aapl',
        assetType: 'stock',
        currency: 'USD'
      });
      expect(result).toBe('AAPL');
    });

    it('should trim whitespace from symbol', () => {
      const result = SymbolMapper.toYahoo({
        symbol: '  AAPL  ',
        assetType: 'stock',
        currency: 'USD'
      });
      expect(result).toBe('AAPL');
    });

    it('should try bare symbol as fallback', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'TEST',
        assetType: 'unknown',
        exchange: 'UNKNOWN'
      });
      expect(result).toBe('TEST');
    });

    it('should convert "." to "-" for US share-class tickers (BRK.B → BRK-B)', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'BRK.B',
        assetType: 'stock',
        exchange: 'NYSE'
      });
      expect(result).toBe('BRK-B');
    });

    it('should convert "." to "-" for US tickers detected by USD heuristic', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'BF.B',
        assetType: 'stock',
        currency: 'USD'
      });
      expect(result).toBe('BF-B');
    });

    it('should add .TO suffix for TSE-listed instruments (XIU → XIU.TO)', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'XIU',
        assetType: 'etf',
        exchange: 'TSE'
      });
      expect(result).toBe('XIU.TO');
    });

    it('should add .TO suffix for TSX exchange alias', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'SHOP',
        assetType: 'stock',
        exchange: 'TSX'
      });
      expect(result).toBe('SHOP.TO');
    });

    it('should add .L suffix for LSE-listed instruments', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'BP',
        assetType: 'stock',
        exchange: 'LSE'
      });
      expect(result).toBe('BP.L');
    });

    it('should add .HK suffix for Hong Kong-listed instruments', () => {
      const result = SymbolMapper.toYahoo({
        symbol: '0700',
        assetType: 'stock',
        exchange: 'HKEX'
      });
      expect(result).toBe('0700.HK');
    });

    it('should not double-append international suffix', () => {
      const result = SymbolMapper.toYahoo({
        symbol: 'XIU.TO',
        assetType: 'etf',
        exchange: 'TSE'
      });
      expect(result).toBe('XIU.TO');
    });
  });
});
