// Cash and deposits trade at par (averageCost ≈ 1 nominal). When the price
// refresher hasn't populated currentPrice, fall back to averageCost so the
// value isn't silently treated as zero.
const HOLDS_AT_PAR = new Set(['cash', 'deposit']);

// Bonds, BOPREAL, LECAP and ON are quoted per 100 nominales (% of par);
// both averageCost and currentPrice are stored in that convention.
// Mirrors AssetType.priceFaceValue() in the backend domain.
const QUOTED_PER_HUNDRED = new Set(['bond', 'bopreal', 'lecap', 'on']);

export function priceFaceValue(assetType) {
  return QUOTED_PER_HUNDRED.has(assetType) ? 100 : 1;
}

export function effectivePrice(p) {
  if (p.currentPrice != null) return p.currentPrice;
  if (HOLDS_AT_PAR.has(p.assetType)) return p.averageCost;
  return null;
}

export function marketValue(p) {
  const price = effectivePrice(p);
  return price != null ? p.quantity * (price / priceFaceValue(p.assetType)) : null;
}

export function costBasis(p) {
  return p.quantity * (p.averageCost / priceFaceValue(p.assetType));
}
