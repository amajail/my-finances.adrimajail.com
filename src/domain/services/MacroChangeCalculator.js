/**
 * MacroChangeCalculator (feature 012)
 *
 * Pure domain service: computes the deterministic week-over-week comparison of
 * the numeric macro indicators between two captured macro panels (feature 006).
 * For each numeric indicator present (and available) in BOTH the prior and the
 * current panel, it produces the prior/current value + as-of date, the signed
 * absolute change, and the percent change. Returns:
 *   - null  when `priorMacro` is null/absent (no prior analysis — e.g. first run; FR-006).
 *   - []    when there is a prior panel but no indicator qualifies (rendered as omitted).
 *   - [MacroChangeRow, ...] otherwise.
 *
 * Only the numeric indicators in KEY_META are compared; non-numeric indicators
 * (e.g. the textual IMF review status) are excluded (FR-005).
 */

/**
 * The numeric macro indicators to compare, in display order, with their label
 * and unit. Mirrors the analysis-detail panel's MACRO_GROUPS. Keys not listed
 * here are skipped — which naturally excludes the textual `imfReviewStatus`.
 */
const KEY_META = [
  { key: 'riesgoPais', label: 'Riesgo país', unit: 'bp' },
  { key: 'fxGap', label: 'MEP/official gap', unit: '%' },
  { key: 'bcraReserves', label: 'BCRA reserves', unit: 'USD M' },
  { key: 'argInflation', label: 'Monthly inflation', unit: '%' },
  { key: 'argInterestRate', label: 'Policy rate', unit: '%' },
  { key: 'usaInflation', label: 'CPI (YoY)', unit: '%' },
  { key: 'usaInterestRate', label: 'Fed funds (upper)', unit: '%' },
  { key: 'sp500Drawdown', label: 'S&P 500 drawdown', unit: '%' },
];

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Is a macro reading usable for comparison: present, not flagged unavailable,
 * and carrying a finite numeric value.
 * @param {*} r
 * @returns {boolean}
 */
function usable(r) {
  return !!r && r.available !== false && typeof r.value === 'number' && Number.isFinite(r.value);
}

/**
 * @typedef {Object} MacroChangeRow
 * @property {string} key
 * @property {string} label
 * @property {string} unit
 * @property {number} priorValue
 * @property {string|null} priorAsOf
 * @property {number} currentValue
 * @property {string|null} currentAsOf
 * @property {number} deltaAbs
 * @property {number|null} deltaPct - null when priorValue === 0 (no divide-by-zero).
 */

class MacroChangeCalculator {
  /**
   * @param {Object|null} priorMacro   - prior analysis's macroContext panel, or null.
   * @param {Object|null} currentMacro - current run's macroContext panel.
   * @returns {MacroChangeRow[]|null}  null when there is no prior panel (FR-006);
   *   otherwise the comparison rows (possibly []).
   */
  static diff(priorMacro, currentMacro) {
    if (!priorMacro || typeof priorMacro !== 'object') return null;
    const current = currentMacro && typeof currentMacro === 'object' ? currentMacro : {};

    const rows = [];
    for (const { key, label, unit } of KEY_META) {
      const prior = priorMacro[key];
      const curr = current[key];
      if (!usable(prior) || !usable(curr)) continue; // FR-004: only when both sides usable

      const priorValue = prior.value;
      const currentValue = curr.value;
      const deltaAbs = round2(currentValue - priorValue);
      const deltaPct = priorValue === 0 ? null : round2(((currentValue - priorValue) / priorValue) * 100); // FR-010

      rows.push({
        key,
        label,
        unit,
        priorValue,
        priorAsOf: prior.asOf || null,
        currentValue,
        currentAsOf: curr.asOf || null,
        deltaAbs,
        deltaPct,
      });
    }
    return rows;
  }
}

module.exports = MacroChangeCalculator;
