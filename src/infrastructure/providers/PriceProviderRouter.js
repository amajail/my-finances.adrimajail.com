/**
 * Price Provider Router
 *
 * Routes price requests to the appropriate provider based on asset type and currency.
 * Argentine ARS-denominated fixed income (bond, bopreal, lecap, on) goes to Rava
 * if available; everything else falls back to Yahoo (the default).
 */

const ARS_FIXED_INCOME = new Set(['bond', 'bopreal', 'lecap', 'on']);

class PriceProviderRouter {
  /**
   * @param {Object} [providers={}] - Map of provider instances, e.g. { yahoo, rava }.
   */
  constructor(providers = {}) {
    this._providers = providers;
    this._default = providers.yahoo || Object.values(providers)[0];
  }

  /**
   * Pick a provider for a position based on its asset type and currency.
   * @param {Position|{assetType: string, currency: string}} position
   * @returns {IPriceProvider}
   */
  pickFor(position) {
    if (!position) return this._default;

    const assetType = position.assetType;
    const currency = position.currency;

    if (this._providers.rava && ARS_FIXED_INCOME.has(assetType) && currency === 'ARS') {
      return this._providers.rava;
    }

    return this._default;
  }
}

module.exports = PriceProviderRouter;
