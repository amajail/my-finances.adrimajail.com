/**
 * Hand-rolled SVG charting helpers (feature 008). CommonJS so the pure helpers
 * are unit-testable under jest; imported by charts.astro via Vite.
 *
 * Pure helpers (tested): METRIC_CATALOGUE, buildSeries, niceScale, sliceLastN,
 * imfChangePoints. SVG renderers (visual): lineChartSvg, dualAxisSvg,
 * eventStripSvg. Gaps (unavailable readings) are never plotted as 0 and never
 * interpolated across — the path breaks and a distinct marker is drawn.
 */

const METRIC_CATALOGUE = [
  // Argentina
  { key: 'riesgoPais', label: 'Riesgo país', unit: 'bp', group: 'Argentina', source: 'macro' },
  { key: 'fxGap', label: 'MEP/official gap', unit: '%', group: 'Argentina', source: 'macro' },
  { key: 'bcraReserves', label: 'BCRA reserves', unit: 'USD M', group: 'Argentina', source: 'macro' },
  { key: 'argInflation', label: 'AR inflation', unit: '%', group: 'Argentina', source: 'macro' },
  { key: 'argInterestRate', label: 'AR policy rate', unit: '%', group: 'Argentina', source: 'macro' },
  // US
  { key: 'usaInflation', label: 'US CPI (YoY)', unit: '%', group: 'United States', source: 'macro' },
  { key: 'usaInterestRate', label: 'US Fed funds', unit: '%', group: 'United States', source: 'macro' },
  // Global
  { key: 'sp500Drawdown', label: 'S&P 500 drawdown', unit: '%', group: 'Global', source: 'macro' },
  // Portfolio totals
  { key: 'totalUsd', label: 'Total USD', unit: 'USD', group: 'Portfolio', source: 'totals' },
  { key: 'totalArs', label: 'Total ARS', unit: 'ARS', group: 'Portfolio', source: 'totals' },
  { key: 'unrealizedPnlUsd', label: 'Unrealized P&L', unit: 'USD', group: 'Portfolio', source: 'totals' },
  { key: 'grandTotalUsd', label: 'Grand total', unit: 'USD', group: 'Portfolio', source: 'totals' },
];

const PORTFOLIO_KEYS = METRIC_CATALOGUE.filter((m) => m.source === 'totals').map((m) => m.key);
const MACRO_NUMERIC_KEYS = METRIC_CATALOGUE.filter((m) => m.source === 'macro').map((m) => m.key);

function isFiniteNum(v) {
  return typeof v === 'number' ? Number.isFinite(v) : (v != null && v !== '' && Number.isFinite(Number(v)));
}

/**
 * Build a per-point series for one metric. value is a real number only when the
 * reading exists, is available, and is finite — otherwise null (a gap).
 * @returns {Array<{date:string, value:number|null, asOf:string|null, available:boolean}>}
 */
function buildSeries(points, metric) {
  const { key, source } = metric;
  return (points || []).map((p) => {
    if (source === 'macro') {
      const r = p.macroContext ? p.macroContext[key] : null;
      const ok = !!(r && r.available !== false && isFiniteNum(r.value));
      return { date: p.date, value: ok ? Number(r.value) : null, asOf: r ? r.asOf || null : null, available: ok };
    }
    const t = p.portfolioTotals;
    const v = t ? t[key] : undefined;
    const ok = isFiniteNum(v);
    return { date: p.date, value: ok ? Number(v) : null, asOf: t ? t.mepRateAsOf || p.date : null, available: ok };
  });
}

/** Rounded, padded axis bounds for a set of numbers (never min===max). */
function niceScale(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return { min: min - pad, max: max + pad };
  }
  const span = max - min;
  const pad = span * 0.08;
  return { min: min - pad, max: max + pad };
}

/** Last n points (n falsy or 'all' → all). */
function sliceLastN(points, n) {
  const arr = points || [];
  const num = parseInt(n, 10);
  if (!Number.isFinite(num) || num <= 0) return arr.slice();
  return arr.slice(-num);
}

/** Collapse the IMF status series to change-points; unavailable/absent → 'unknown'. */
function imfChangePoints(points) {
  const out = [];
  let prev = null;
  for (const p of points || []) {
    const r = p.macroContext ? p.macroContext.imfReviewStatus : null;
    const status = r && r.available !== false && r.value ? String(r.value) : 'unknown';
    if (status !== prev) {
      out.push({ date: p.date, status });
      prev = status;
    }
  }
  return out;
}

// ==================== SVG renderers (visual) ====================

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(v) {
  return Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function plotGeometry(series, w, h) {
  const padL = 6, padR = 6, padT = 10, padB = 16;
  const n = series.length;
  const xs = (i) => (n <= 1 ? (w / 2) : padL + (i * (w - padL - padR)) / (n - 1));
  const vals = series.filter((d) => d.value != null).map((d) => d.value);
  const sc = niceScale(Math.min(...(vals.length ? vals : [0])), Math.max(...(vals.length ? vals : [1])));
  const ys = (v) => padT + (1 - (v - sc.min) / (sc.max - sc.min || 1)) * (h - padT - padB);
  return { xs, ys, sc, padB, padL, padR, padT };
}

/** A single mini line chart. Path breaks at gaps; gaps get a distinct marker. */
function lineChartSvg(series, opts = {}) {
  const w = opts.w || 230, h = opts.h || 96;
  if (!series.length || series.every((d) => d.value == null)) {
    return `<svg viewBox="0 0 ${w} ${h}" class="w-full"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="10" fill="#888">no data</text></svg>`;
  }
  const g = plotGeometry(series, w, h);
  // Path segments — break at nulls (no interpolation across gaps).
  let d = '', started = false, circles = '', gaps = '';
  series.forEach((pt, i) => {
    const x = g.xs(i);
    if (pt.value == null) {
      started = false;
      gaps += `<line x1="${x}" y1="${g.padT}" x2="${x}" y2="${h - g.padB}" stroke="#bbb" stroke-width="1" stroke-dasharray="2 2"><title>unavailable · ${esc(pt.date)}</title></line>`;
      return;
    }
    const y = g.ys(pt.value);
    d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    started = true;
    circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="var(--color-accent,#4f8)"><title>${fmt(pt.value)}${opts.unit ? ' ' + opts.unit : ''}${pt.asOf ? ' · as of ' + esc(pt.asOf) : ''} (${esc(pt.date)})</title></circle>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">`
    + `<text x="${g.padL}" y="8" font-size="8" fill="#888">${fmt(g.sc.max)}</text>`
    + `<text x="${g.padL}" y="${h - g.padB + 12}" font-size="8" fill="#888">${fmt(g.sc.min)}</text>`
    + gaps
    + `<path d="${d}" fill="none" stroke="var(--color-accent,#4f8)" stroke-width="1.5" />`
    + circles
    + `</svg>`;
}

/** Two series on independent left/right axes, shared x. */
function dualAxisSvg(left, right, opts = {}) {
  const w = opts.w || 640, h = opts.h || 240;
  const render = (series, color) => {
    if (!series.length || series.every((d) => d.value == null)) return '';
    const g = plotGeometry(series, w, h);
    let d = '', started = false, circles = '';
    series.forEach((pt, i) => {
      const x = g.xs(i);
      if (pt.value == null) { started = false; return; }
      const y = g.ys(pt.value);
      d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; started = true;
      circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"><title>${fmt(pt.value)}${pt.asOf ? ' · as of ' + esc(pt.asOf) : ''} (${esc(pt.date)})</title></circle>`;
    });
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" />${circles}`;
  };
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">`
    + `<text x="6" y="12" font-size="10" fill="#39f">${esc(opts.leftLabel || 'left')}</text>`
    + `<text x="${w - 6}" y="12" text-anchor="end" font-size="10" fill="#f93">${esc(opts.rightLabel || 'right')}</text>`
    + render(left, '#39f') + render(right, '#f93')
    + `</svg>`;
}

/** Categorical IMF status as an event strip with markers at changes. */
function eventStripSvg(points, opts = {}) {
  const w = opts.w || 640, h = 44;
  const n = points.length;
  if (!n) return `<svg viewBox="0 0 ${w} ${h}" class="w-full"><text x="${w / 2}" y="24" text-anchor="middle" font-size="10" fill="#888">no data</text></svg>`;
  const xs = (i) => (n <= 1 ? w / 2 : 8 + (i * (w - 16)) / (n - 1));
  let prev = null, marks = '';
  points.forEach((p, i) => {
    const r = p.macroContext ? p.macroContext.imfReviewStatus : null;
    const status = r && r.available !== false && r.value ? String(r.value) : 'unknown';
    const x = xs(i);
    const changed = status !== prev;
    marks += `<circle cx="${x.toFixed(1)}" cy="22" r="${changed ? 4 : 2}" fill="${status === 'unknown' ? '#bbb' : 'var(--color-accent,#4f8)'}"><title>${esc(status)} · ${esc(p.date)}</title></circle>`;
    if (changed) marks += `<text x="${x.toFixed(1)}" y="14" text-anchor="middle" font-size="8" fill="#888">${esc(status)}</text>`;
    prev = status;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full"><line x1="8" y1="22" x2="${w - 8}" y2="22" stroke="#ddd" stroke-width="1" />${marks}</svg>`;
}

module.exports = {
  METRIC_CATALOGUE, PORTFOLIO_KEYS, MACRO_NUMERIC_KEYS,
  buildSeries, niceScale, sliceLastN, imfChangePoints,
  lineChartSvg, dualAxisSvg, eventStripSvg,
};
