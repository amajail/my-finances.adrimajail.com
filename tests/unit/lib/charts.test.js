/**
 * Pure charting helpers (feature 008). The SVG renderers are visual UI; here we
 * test the pure logic (series/gap building, scale, slice, IMF reducer) and smoke
 * the renderers return SVG.
 */

const {
  METRIC_CATALOGUE, buildSeries, niceScale, sliceLastN, imfChangePoints,
  lineChartSvg, dualAxisSvg, eventStripSvg,
  indexTo100, growthPct, multiLineSvg,
} = require('../../../dashboard/src/lib/charts.cjs');

describe('indexTo100 (feature 009)', () => {
  it('rebases the first available value to 100 and keeps gaps null', () => {
    const out = indexTo100([
      { date: 'a', value: 50 }, { date: 'b', value: 75 }, { date: 'c', value: null },
    ]);
    expect(out.map((d) => d.value)).toEqual([100, 150, null]);
  });
  it('uses the first AVAILABLE value as the base (skips leading gaps)', () => {
    const out = indexTo100([{ date: 'a', value: null }, { date: 'b', value: 200 }, { date: 'c', value: 220 }]);
    expect(out.map((d) => d.value)).toEqual([null, 100, 110]);
  });
  it('returns all null when no base value exists', () => {
    expect(indexTo100([{ date: 'a', value: null }]).map((d) => d.value)).toEqual([null]);
  });
});

describe('growthPct (feature 009)', () => {
  it('returns last index − 100', () => {
    expect(growthPct([{ value: 100 }, { value: 108.5 }])).toBe(8.5);
  });
  it('returns null for an all-gap series', () => {
    expect(growthPct([{ value: null }])).toBeNull();
  });
});

describe('multiLineSvg (feature 009, smoke)', () => {
  it('renders multiple indexed series with a 100 baseline', () => {
    const svg = multiLineSvg([
      { label: 'Portfolio', color: '#0a0', series: [{ date: 'a', value: 100 }, { date: 'b', value: 110 }] },
      { label: 'MEP', color: '#00a', series: [{ date: 'a', value: 100 }, { date: 'b', value: 95 }] },
    ]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Portfolio');
    expect(svg).toContain('100');
  });
});

const macroPoint = (date, over = {}) => ({
  date,
  macroContext: {
    riesgoPais: { value: 500, asOf: date, available: true },
    imfReviewStatus: { value: 'approved', asOf: date, available: true },
    ...over,
  },
  portfolioTotals: { totalUsd: 100000, totalArs: 5000000, unrealizedPnlUsd: 1200, grandTotalUsd: 101000, mepRateAsOf: date },
});

describe('buildSeries', () => {
  const macro = METRIC_CATALOGUE.find((m) => m.key === 'riesgoPais');
  const total = METRIC_CATALOGUE.find((m) => m.key === 'totalUsd');

  it('maps a macro reading to a numeric value with as-of', () => {
    const s = buildSeries([macroPoint('2026-06-05')], macro);
    expect(s[0]).toMatchObject({ date: '2026-06-05', value: 500, asOf: '2026-06-05', available: true });
  });

  it('marks unavailable / missing macro readings as gaps (null), never 0', () => {
    const s = buildSeries([
      macroPoint('2026-06-05', { riesgoPais: { value: null, asOf: null, available: false } }),
      { date: '2026-06-12', macroContext: null, portfolioTotals: null },
    ], macro);
    expect(s[0].value).toBeNull();
    expect(s[0].available).toBe(false);
    expect(s[1].value).toBeNull();
  });

  it('maps a portfolio total', () => {
    const s = buildSeries([macroPoint('2026-06-05')], total);
    expect(s[0].value).toBe(100000);
  });
});

describe('niceScale', () => {
  it('pads when min === max (never zero-height)', () => {
    const { min, max } = niceScale(5, 5);
    expect(max).toBeGreaterThan(min);
  });
  it('pads a normal range', () => {
    const { min, max } = niceScale(0, 100);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(100);
  });
});

describe('sliceLastN', () => {
  const pts = [1, 2, 3, 4, 5].map((n) => ({ date: `d${n}` }));
  it('returns the last n', () => expect(sliceLastN(pts, 2).map((p) => p.date)).toEqual(['d4', 'd5']));
  it('returns all for "all" or non-numeric', () => expect(sliceLastN(pts, 'all')).toHaveLength(5));
  it('returns all when fewer than n', () => expect(sliceLastN(pts, 99)).toHaveLength(5));
});

describe('imfChangePoints', () => {
  it('emits a point only at status changes; unavailable → unknown', () => {
    const pts = [
      macroPoint('2026-05-01', { imfReviewStatus: { value: 'pending', available: true } }),
      macroPoint('2026-05-08', { imfReviewStatus: { value: 'pending', available: true } }),
      macroPoint('2026-05-15', { imfReviewStatus: { value: 'approved', available: true } }),
      macroPoint('2026-05-22', { imfReviewStatus: { value: null, available: false } }),
    ];
    const cp = imfChangePoints(pts);
    expect(cp).toEqual([
      { date: '2026-05-01', status: 'pending' },
      { date: '2026-05-15', status: 'approved' },
      { date: '2026-05-22', status: 'unknown' },
    ]);
  });
});

describe('SVG renderers (smoke)', () => {
  const macro = METRIC_CATALOGUE.find((m) => m.key === 'riesgoPais');
  const total = METRIC_CATALOGUE.find((m) => m.key === 'totalUsd');
  const pts = [macroPoint('2026-06-05'), macroPoint('2026-06-12')];

  it('lineChartSvg returns an svg with points', () => {
    const svg = lineChartSvg(buildSeries(pts, macro), { unit: 'bp' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<circle');
  });
  it('dualAxisSvg renders two series with independent scales', () => {
    const svg = dualAxisSvg(buildSeries(pts, total), buildSeries(pts, macro), { leftLabel: 'USD', rightLabel: 'bp' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('USD');
    expect(svg).toContain('bp');
  });
  it('eventStripSvg renders the IMF strip', () => {
    expect(eventStripSvg(pts)).toContain('<svg');
  });
  it('lineChartSvg degrades to "no data" with an all-gap series', () => {
    expect(lineChartSvg([{ date: 'd', value: null, asOf: null, available: false }])).toContain('no data');
  });
});
