/**
 * Price Provider Router
 *
 * Routes a position to an ordered chain of price providers. Callers walk the
 * chain in order and stop at the first provider that returns a quote.
 *
 * Routing policy for Argentine fixed income (bond, bopreal, lecap, on):
 *   - IOL first (covers both ARS and USD).
 *   - Cohen second, only when currency is ARS (Cohen does not reliably cover USD bonds).
 *   - Yahoo last, as a final fallback.
 * Everything else routes to Yahoo (the default).
 */

const FIXED_INCOME = new Set(['bond', 'bopreal', 'lecap', 'on']);

class PriceProviderRouter {
  /**
   * @param {Object} [providers={}] - Map of provider instances, e.g. { yahoo, cohen, iol }.
   */
  constructor(providers = {}) {
    this._providers = providers;
    this._default = providers.yahoo || Object.values(providers)[0];
  }

  /**
   * Return the ordered list of providers to try for a position.
   * Callers should attempt each in order and stop at the first success.
   * @param {Position|{assetType: string, currency: string}} position
   * @returns {IPriceProvider[]}
   */
  chainFor(position) {
    if (!position) return [this._default].filter(Boolean);

    const { assetType, currency } = position;

    if (FIXED_INCOME.has(assetType)) {
      const chain = [];
      if (this._providers.iol) chain.push(this._providers.iol);
      if (currency === 'ARS' && this._providers.cohen) chain.push(this._providers.cohen);
      if (this._default) chain.push(this._default);
      return chain;
    }

    return [this._default].filter(Boolean);
  }
}

module.exports = PriceProviderRouter;
