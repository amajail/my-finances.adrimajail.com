/**
 * Symbol Mapper
 *
 * Maps canonical symbols and asset metadata to provider-specific symbols.
 * Static utility class for converting between our internal representation
 * and external provider formats.
 */
class SymbolMapper {
  /**
   * Map a position's symbol to the Yahoo Finance ticker.
   * @param {{ symbol: string, assetType: string, exchange?: string, currency?: string }} args
   * @returns {string|null}  null = skip (no quote possible from this provider)
   */
  static toYahoo({ symbol, assetType, exchange, currency }) {
    if (!symbol) return null;
    const sym = String(symbol).toUpperCase().trim();

    // Skip non-quotable types
    if (assetType === 'cash' || assetType === 'deposit') return null;

    // US-traded: use the symbol as-is, but Yahoo uses '-' instead of '.' for share classes
    // (e.g. BRK.B -> BRK-B, BF.B -> BF-B). Detect by exchange or by currency=USD on stock/etf.
    const usExchanges = ['NYSE', 'NASDAQ', 'ARCA', 'BATS', 'AMEX'];
    const toUsTicker = (s) => s.replace(/\./g, '-');
    if (exchange && usExchanges.includes(String(exchange).toUpperCase())) {
      return toUsTicker(sym);
    }
    if ((assetType === 'stock' || assetType === 'etf') && currency === 'USD' && !exchange) {
      return toUsTicker(sym);  // assume US
    }

    // Other international exchanges that use a Yahoo suffix.
    const exchangeSuffix = {
      TSE: '.TO',   // Toronto Stock Exchange
      TSX: '.TO',   // alias
      LSE: '.L',    // London Stock Exchange
      HKEX: '.HK',  // Hong Kong
      HKG: '.HK',
      ASX: '.AX',   // Australian Securities Exchange
      FRA: '.DE',   // Frankfurt / Deutsche Börse
      XETRA: '.DE',
      EPA: '.PA',   // Euronext Paris
      AMS: '.AS',   // Euronext Amsterdam
      BIT: '.MI',   // Borsa Italiana
      BME: '.MC',   // Bolsa de Madrid
      SWX: '.SW',   // SIX Swiss Exchange
      TYO: '.T',    // Tokyo
    };
    if (exchange) {
      const suffix = exchangeSuffix[String(exchange).toUpperCase()];
      if (suffix) {
        return sym.endsWith(suffix) ? sym : `${sym}${suffix}`;
      }
    }

    // ARG-listed instruments: bonds, bopreal, lecap, on, cedear, or BCBA-listed stock/etf
    if (
      assetType === 'bond' ||
      assetType === 'bopreal' ||
      assetType === 'lecap' ||
      assetType === 'on' ||
      assetType === 'cedear' ||
      (exchange && String(exchange).toUpperCase() === 'BCBA')
    ) {
      // Already has a Yahoo suffix? Don't double-append.
      if (sym.endsWith('.BA')) return sym;
      return `${sym}.BA`;
    }

    // Default: try the symbol bare
    return sym;
  }
}

module.exports = SymbolMapper;
