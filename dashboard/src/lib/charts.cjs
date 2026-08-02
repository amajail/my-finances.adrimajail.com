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
  // Portfolio totals — invested capital only. The raw totalUsd/grandTotalUsd
  // keys are still delivered by the API but are deliberately NOT charted: the
  // earmarked reserve entered them the week it was first priced, which reads as
  // a spike that never happened. The API derives the investable* keys for every
  // row, including pre-earmark ones (see EarmarkedTotals).
  { key: 'investableUsd', label: 'USD sleeve (ex-reserve)', unit: 'USD', group: 'Portfolio', source: 'totals' },
  { key: 'investableArs', label: 'ARS sleeve (ex-reserve)', unit: 'ARS', group: 'Portfolio', source: 'totals' },
  { key: 'unrealizedPnlUsd', label: 'Unrealized P&L', unit: 'USD', group: 'Portfolio', source: 'totals' },
  { key: 'investableTotalUsd', label: 'Invested total (ex-reserve)', unit: 'USD', group: 'Portfolio', source: 'totals' },
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

/**
 * Keep only the points that actually carry data of a given source, so a chart's
 * x-axis reflects that metric's own cadence. Rows that never had a macro panel
 * (e.g. portfolio-only / pre-macro-capture analyses) would otherwise inject
 * spurious gaps into every macro chart — isolating real readings as lone dots.
 * A row IS kept when its panel object exists even if this metric's reading is
 * unavailable (that stays a genuine gap).
 */
function pointsForSource(points, source) {
  return (points || []).filter((p) => (source === 'macro' ? p.macroContext != null : p.portfolioTotals != null));
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

// Theme colors — resolved from the dashboard's CSS custom properties at render
// time (var() works inside inline SVG), with hex fallbacks matching @amajail/ui.
// Using tokens keeps the hand-rolled SVGs legible on the light theme instead of
// the old faint hardcoded greys.
const C = {
  muted: 'var(--color-muted,#64748b)',   // axis / date / label text
  grid: 'var(--color-border,#e2e8f0)',   // gridlines, baselines
  band: 'var(--color-surface-2,#f1f5f9)', // gap "no data" shading
  accent: 'var(--color-accent,#1d4ed8)', // primary series (blue)
  accent2: '#d97706',                    // secondary series in overlays (amber-600)
};

/** Index ranges [start,end] of contiguous null (gap) runs in a series. */
function contiguousGapRuns(series) {
  const runs = [];
  let start = -1;
  (series || []).forEach((d, i) => {
    if (d.value == null) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      runs.push([start, i - 1]);
      start = -1;
    }
  });
  if (start !== -1) runs.push([start, series.length - 1]);
  return runs;
}

function plotGeometry(series, w, h, pad = {}) {
  const padL = pad.l != null ? pad.l : 6;
  const padR = pad.r != null ? pad.r : 6;
  const padT = pad.t != null ? pad.t : 10;
  const padB = pad.b != null ? pad.b : 16;
  const n = series.length;
  const xs = (i) => (n <= 1 ? (w / 2) : padL + (i * (w - padL - padR)) / (n - 1));
  const vals = series.filter((d) => d.value != null).map((d) => d.value);
  const sc = niceScale(Math.min(...(vals.length ? vals : [0])), Math.max(...(vals.length ? vals : [1])));
  const ys = (v) => padT + (1 - (v - sc.min) / (sc.max - sc.min || 1)) * (h - padT - padB);
  return { xs, ys, sc, padB, padL, padR, padT };
}

/**
 * A single mini line chart. Path breaks at gaps (no interpolation); each
 * contiguous run of missing weeks is shown as ONE soft shaded band rather than a
 * per-week dashed line (which used to stack into a "barcode"). First/last dates
 * label the x-axis; the y min/max sit outside faint gridlines.
 */
function lineChartSvg(series, opts = {}) {
  const w = opts.w || 230, h = opts.h || 112;
  // opts.fmtValue overrides how values print (privacy mode passes a mask for
  // money charts); the line shape itself always stays real.
  const fv = opts.fmtValue || fmt;
  if (!series.length || series.every((d) => d.value == null)) {
    return `<svg viewBox="0 0 ${w} ${h}" class="w-full"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="10" fill="${C.muted}">no data</text></svg>`;
  }
  const pad = { l: 6, r: 6, t: 14, b: 28 };
  const g = plotGeometry(series, w, h, pad);
  const top = g.padT, bot = h - g.padB;

  // One shaded band per contiguous gap run (edge → mid-point of neighbours).
  let bands = '';
  for (const [i0, i1] of contiguousGapRuns(series)) {
    const left = i0 === 0 ? g.padL : (g.xs(i0 - 1) + g.xs(i0)) / 2;
    const right = i1 === series.length - 1 ? (w - g.padR) : (g.xs(i1) + g.xs(i1 + 1)) / 2;
    const bw = Math.max(1, right - left);
    bands += `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(bot - top).toFixed(1)}" fill="${C.band}"><title>no data · ${esc(series[i0].date)}${i1 > i0 ? ' … ' + esc(series[i1].date) : ''}</title></rect>`;
  }

  // Path segments — break at nulls (no interpolation across gaps).
  let d = '', started = false, circles = '';
  series.forEach((pt, i) => {
    if (pt.value == null) { started = false; return; }
    const x = g.xs(i), y = g.ys(pt.value);
    d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    started = true;
    circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${C.accent}"><title>${fv(pt.value)}${opts.unit ? ' ' + opts.unit : ''}${pt.asOf ? ' · as of ' + esc(pt.asOf) : ''} (${esc(pt.date)})</title></circle>`;
  });

  const grid = `<line x1="${g.padL}" y1="${top.toFixed(1)}" x2="${w - g.padR}" y2="${top.toFixed(1)}" stroke="${C.grid}" stroke-width="1" />`
    + `<line x1="${g.padL}" y1="${bot.toFixed(1)}" x2="${w - g.padR}" y2="${bot.toFixed(1)}" stroke="${C.grid}" stroke-width="1" />`;
  const first = series[0].date, last = series[series.length - 1].date;
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">`
    + bands
    + grid
    + `<text x="${g.padL}" y="${(top - 3).toFixed(1)}" font-size="8" fill="${C.muted}">${fv(g.sc.max)}</text>`
    + `<text x="${g.padL}" y="${(bot + 9).toFixed(1)}" font-size="8" fill="${C.muted}">${fv(g.sc.min)}</text>`
    + `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="1.5" />`
    + circles
    + `<text x="${g.padL}" y="${h - 3}" font-size="8" fill="${C.muted}">${esc(first)}</text>`
    + (last !== first ? `<text x="${w - g.padR}" y="${h - 3}" text-anchor="end" font-size="8" fill="${C.muted}">${esc(last)}</text>` : '')
    + `</svg>`;
}

/**
 * Two series on independent left/right axes, shared x. Each axis gets min/mid/max
 * numeric ticks in its series colour (left = accent, right = amber) so the values
 * are actually readable; first/last dates label the x-axis; faint gridlines are
 * drawn off the left scale.
 */
function dualAxisSvg(left, right, opts = {}) {
  const w = opts.w || 640, h = opts.h || 240;
  const pad = { l: 48, r: 56, t: 24, b: 26 };
  const has = (s) => s && s.some((d) => d && d.value != null);
  const gL = has(left) ? plotGeometry(left, w, h, pad) : null;
  const gR = has(right) ? plotGeometry(right, w, h, pad) : null;
  // Per-side value formatters (privacy mode masks the money side(s) only).
  const fvL = opts.fmtValueLeft || fmt;
  const fvR = opts.fmtValueRight || fmt;

  const draw = (series, g, color, fv) => {
    if (!g) return '';
    let d = '', started = false, circles = '';
    series.forEach((pt, i) => {
      if (pt.value == null) { started = false; return; }
      const x = g.xs(i), y = g.ys(pt.value);
      d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; started = true;
      circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"><title>${fv(pt.value)}${pt.asOf ? ' · as of ' + esc(pt.asOf) : ''} (${esc(pt.date)})</title></circle>`;
    });
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" />${circles}`;
  };
  const tickVals = (g) => [g.sc.max, (g.sc.max + g.sc.min) / 2, g.sc.min];
  const ticks = (g, color, side, fv) => (g ? tickVals(g).map((v) => {
    const x = side === 'left' ? pad.l - 4 : w - pad.r + 4;
    return `<text x="${x}" y="${(g.ys(v) + 3).toFixed(1)}" text-anchor="${side === 'left' ? 'end' : 'start'}" font-size="9" fill="${color}">${fv(v)}</text>`;
  }).join('') : '');

  const gGrid = gL || gR;
  const grid = gGrid ? tickVals(gGrid).map((v) => `<line x1="${pad.l}" y1="${gGrid.ys(v).toFixed(1)}" x2="${w - pad.r}" y2="${gGrid.ys(v).toFixed(1)}" stroke="${C.grid}" stroke-width="1" />`).join('') : '';

  const dates = (has(left) ? left : (right || [])).map((d) => d.date);
  const n = dates.length;
  const xdates = n ? `<text x="${pad.l}" y="${h - 6}" font-size="9" fill="${C.muted}">${esc(dates[0])}</text>`
    + (n > 1 ? `<text x="${w - pad.r}" y="${h - 6}" text-anchor="end" font-size="9" fill="${C.muted}">${esc(dates[n - 1])}</text>` : '') : '';

  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">`
    + grid
    + `<text x="${pad.l}" y="14" font-size="10" fill="${C.accent}">${esc(opts.leftLabel || 'left')}</text>`
    + `<text x="${w - pad.r}" y="14" text-anchor="end" font-size="10" fill="${C.accent2}">${esc(opts.rightLabel || 'right')}</text>`
    + draw(left, gL, C.accent, fvL) + draw(right, gR, C.accent2, fvR)
    + ticks(gL, C.accent, 'left', fvL) + ticks(gR, C.accent2, 'right', fvR)
    + xdates
    + `</svg>`;
}

/**
 * Categorical IMF status as an event strip with markers at changes. A change
 * label is only drawn when it clears the previously drawn one horizontally, so
 * adjacent transitions no longer overprint into unreadable text (the dot +
 * tooltip still mark every change).
 */
function eventStripSvg(points, opts = {}) {
  const w = opts.w || 640, h = 44;
  const n = points.length;
  if (!n) return `<svg viewBox="0 0 ${w} ${h}" class="w-full"><text x="${w / 2}" y="24" text-anchor="middle" font-size="10" fill="${C.muted}">no data</text></svg>`;
  const xs = (i) => (n <= 1 ? w / 2 : 8 + (i * (w - 16)) / (n - 1));
  const MIN_LABEL_GAP = 46; // px; skip labels closer than this to the last drawn
  let prev = null, lastLabelX = -Infinity, marks = '';
  points.forEach((p, i) => {
    const r = p.macroContext ? p.macroContext.imfReviewStatus : null;
    const status = r && r.available !== false && r.value ? String(r.value) : 'unknown';
    const x = xs(i);
    const changed = status !== prev;
    marks += `<circle cx="${x.toFixed(1)}" cy="26" r="${changed ? 4 : 2}" fill="${status === 'unknown' ? C.muted : C.accent}"><title>${esc(status)} · ${esc(p.date)}</title></circle>`;
    if (changed && x - lastLabelX >= MIN_LABEL_GAP) {
      marks += `<text x="${x.toFixed(1)}" y="14" text-anchor="middle" font-size="9" fill="${C.muted}">${esc(status)}</text>`;
      lastLabelX = x;
    }
    prev = status;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full"><line x1="8" y1="26" x2="${w - 8}" y2="26" stroke="${C.grid}" stroke-width="1" />${marks}</svg>`;
}

// ==================== Feature 009: indexed growth ====================

/** Rebase a series so its first available value is 100 (v_i / v_0 × 100); gaps stay null. */
function indexTo100(series) {
  const arr = Array.isArray(series) ? series : [];
  const base = arr.find((d) => d && d.value != null && Number.isFinite(d.value));
  const b = base ? base.value : null;
  return arr.map((d) => ({
    ...d,
    value: (b && d && d.value != null && Number.isFinite(d.value)) ? Number(((d.value / b) * 100).toFixed(3)) : null,
  }));
}

/** Total growth % of an indexed-to-100 series = last available value − 100. */
function growthPct(series) {
  const arr = (Array.isArray(series) ? series : []).filter((d) => d && d.value != null && Number.isFinite(d.value));
  if (!arr.length) return null;
  return Number((arr[arr.length - 1].value - 100).toFixed(2));
}

/** Multiple series on ONE shared y-axis (all indexed to 100). seriesList: [{label,color,series}]. */
function multiLineSvg(seriesList, opts = {}) {
  const w = opts.w || 680, h = opts.h || 300;
  const padL = 8, padR = 8, padT = 16, padB = 34;
  const list = (seriesList || []).filter((s) => s && Array.isArray(s.series));
  const dates = (list.find((s) => s.series.length) || { series: [] }).series.map((d) => d.date);
  const n = dates.length;
  const allVals = list.flatMap((s) => s.series.filter((d) => d.value != null).map((d) => d.value));
  if (!allVals.length) {
    return `<svg viewBox="0 0 ${w} ${h}" class="w-full"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="11" fill="${C.muted}">no data</text></svg>`;
  }
  const sc = niceScale(Math.min(...allVals, 100), Math.max(...allVals, 100));
  const xs = (i) => (n <= 1 ? w / 2 : padL + (i * (w - padL - padR)) / (n - 1));
  const ys = (v) => padT + (1 - (v - sc.min) / (sc.max - sc.min || 1)) * (h - padT - padB);

  let body = '';
  list.forEach((s) => {
    let d = '', started = false, circles = '';
    s.series.forEach((pt, i) => {
      const x = xs(i);
      if (pt.value == null) { started = false; return; }
      const y = ys(pt.value);
      d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; started = true;
      circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${s.color}"><title>${esc(s.label)}: ${fmt(pt.value)}${pt.asOf ? ' · as of ' + esc(pt.asOf) : ''} (${esc(pt.date)})</title></circle>`;
    });
    body += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" />${circles}`;
  });

  const y100 = ys(100);
  const legend = list.map((s, i) => `<g transform="translate(${padL + i * 130}, ${h - 6})"><rect width="8" height="8" y="-8" fill="${s.color}" /><text x="11" font-size="9" fill="${C.muted}">${esc(s.label)}</text></g>`).join('');
  const xlabels = n ? `<text x="${xs(0)}" y="${h - 20}" font-size="8" fill="${C.muted}">${esc(dates[0])}</text><text x="${xs(n - 1)}" y="${h - 20}" text-anchor="end" font-size="8" fill="${C.muted}">${esc(dates[n - 1])}</text>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full">`
    + `<line x1="${padL}" y1="${y100.toFixed(1)}" x2="${w - padR}" y2="${y100.toFixed(1)}" stroke="${C.grid}" stroke-dasharray="3 3" />`
    + `<text x="${padL}" y="${(y100 - 2).toFixed(1)}" font-size="8" fill="${C.muted}">100</text>`
    + body + xlabels + legend + `</svg>`;
}

module.exports = {
  METRIC_CATALOGUE, PORTFOLIO_KEYS, MACRO_NUMERIC_KEYS,
  buildSeries, pointsForSource, niceScale, sliceLastN, imfChangePoints,
  lineChartSvg, dualAxisSvg, eventStripSvg,
  indexTo100, growthPct, multiLineSvg,
};
