/**
 * ArCpiIndex (feature 009)
 *
 * Pure domain service: builds a cumulative Argentina CPI **level index** from the
 * monthly inflation %s (argentinadatos). Index_n = Index_{n-1} × (1 + pct_n/100),
 * anchored at 100 on the first month. The absolute anchor is irrelevant downstream
 * because the chart re-indexes every series to 100 at the window start — only the
 * proportional level matters.
 */

class ArCpiIndex {
  /**
   * @param {Array<{date: string, percent: number}>} monthly - ascending monthly %.
   * @returns {Array<{date: string, value: number}>} ascending level index (first = 100).
   */
  static build(monthly) {
    const series = (Array.isArray(monthly) ? monthly : [])
      .filter((m) => m && typeof m.date === 'string' && Number.isFinite(Number(m.percent)))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    const out = [];
    let level = 100;
    series.forEach((m, i) => {
      // First month anchors at 100; subsequent months compound the prior level.
      if (i > 0) level = level * (1 + Number(m.percent) / 100);
      out.push({ date: m.date, value: Number(level.toFixed(6)) });
    });
    return out;
  }
}

module.exports = ArCpiIndex;
