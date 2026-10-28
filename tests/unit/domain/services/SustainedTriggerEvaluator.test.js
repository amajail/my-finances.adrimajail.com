/**
 * SustainedTriggerEvaluator (feature 021). Pure, made-up macro numbers only.
 */

const SustainedTriggerEvaluator = require('../../../../src/domain/services/SustainedTriggerEvaluator');

const TARGET = '2026-06-20';
const CURRENT_AS_OF = '2026-06-19';

const reading = (value, asOf, extra = {}) => ({ value, asOf, available: true, ...extra });
const panel = (over = {}) => ({ riesgoPais: reading(850, CURRENT_AS_OF), ...over });

/** Prior weekly analysis whose riesgoPais reading is `value` on `asOf` (default: the analysis date). */
const prior = (date, value, extra = {}) => ({
  date,
  status: 'completed',
  macroContext: { riesgoPais: reading(value, extra.asOf || date, extra.reading) },
  ...(extra.analysis || {}),
});
const unavailable = (date) => ({
  date, status: 'completed', macroContext: { riesgoPais: { value: null, available: false } },
});

// Weekly priors, newest first: 7, 14, 21, 28, 35 days before the current reading.
const WEEKS = ['2026-06-12', '2026-06-05', '2026-05-29', '2026-05-22', '2026-05-15'];
const above = (dates) => dates.map((d) => prior(d, 850));

const run = (priorAnalyses, currentMacro = panel()) =>
  SustainedTriggerEvaluator.evaluate({ currentMacro, priorAnalyses, targetDate: TARGET });
const rp = (rows) => rows.find((r) => r.key === 'riesgoPais');

describe('definitions', () => {
  it('returns one row per framework trigger in fixed order', () => {
    expect(run([]).map((r) => r.key)).toEqual(['riesgoPais', 'fxGap', 'bcraReserves']);
    expect(run([]).map((r) => r.requiredDays)).toEqual([30, 30, 30]);
  });
});

describe('US1 — sustained breach', () => {
  it('fires after 35 days above the threshold', () => {
    const row = rp(run(above(WEEKS)));
    expect(row).toMatchObject({ status: 'met', heldDays: 35, durationMet: true, daysRemaining: null, streakStart: '2026-05-15', currentValue: 850 });
  });

  it('is still building at 14 days, with the days remaining', () => {
    const row = rp(run(above(WEEKS.slice(0, 2))));
    expect(row).toMatchObject({ status: 'building', heldDays: 14, durationMet: false, daysRemaining: 16 });
  });

  it('counts exactly 30 days as met and 29 as building', () => {
    const thirty = rp(run([prior('2026-05-20', 850)], panel({ riesgoPais: reading(850, '2026-06-19') })));
    expect(thirty).toMatchObject({ heldDays: 30, durationMet: true, status: 'met' });
    const twentyNine = rp(run([prior('2026-05-21', 850)], panel({ riesgoPais: reading(850, '2026-06-19') })));
    expect(twentyNine).toMatchObject({ heldDays: 29, durationMet: false, status: 'building', daysRemaining: 1 });
  });

  it('does not treat a value exactly equal to the threshold as satisfying', () => {
    expect(rp(run(above(WEEKS), panel({ riesgoPais: reading(800, CURRENT_AS_OF) }))))
      .toMatchObject({ status: 'not-satisfied', heldDays: 0, durationMet: false });
    // ...nor as part of the streak
    const history = [prior('2026-06-12', 850), prior('2026-06-05', 800), prior('2026-05-29', 850)];
    expect(rp(run(history))).toMatchObject({ heldDays: 7, streakStart: '2026-06-12', historyLimited: false });
  });

  it('is not satisfied, with 0 days, when the current reading no longer breaches', () => {
    expect(rp(run(above(WEEKS), panel({ riesgoPais: reading(790, CURRENT_AS_OF) }))))
      .toMatchObject({ status: 'not-satisfied', heldDays: 0, durationMet: false, currentValue: 790 });
  });

  it('stops the streak at the first violating observation', () => {
    const history = [prior('2026-06-12', 850), prior('2026-06-05', 850), prior('2026-05-29', 700), prior('2026-05-22', 900)];
    expect(rp(run(history))).toMatchObject({ heldDays: 14, streakStart: '2026-06-05', historyLimited: false, status: 'building' });
  });

  it('starts at 0 days, still building, when the previous reading was a violation', () => {
    expect(rp(run([prior('2026-06-12', 700)]))).toMatchObject({ status: 'building', heldDays: 0, daysRemaining: 30, streakStart: null });
  });

  it('uses the lower-than comparison for the reserves trigger and the gap trigger', () => {
    const netPrior = (date, v) => ({ date, status: 'completed', macroContext: { bcraReserves: reading(v, date, { basis: 'net' }) } });
    const rows = SustainedTriggerEvaluator.evaluate({
      currentMacro: { bcraReserves: reading(-5, CURRENT_AS_OF, { basis: 'net' }), fxGap: reading(60, CURRENT_AS_OF) },
      priorAnalyses: [netPrior('2026-05-15', -10), { date: '2026-05-15', status: 'completed', macroContext: { fxGap: reading(51, '2026-05-15') } }],
      targetDate: TARGET,
    });
    expect(rows.find((r) => r.key === 'bcraReserves')).toMatchObject({ status: 'met', heldDays: 35 });
    expect(rows.find((r) => r.key === 'fxGap')).toMatchObject({ status: 'met', heldDays: 35 });
    const equalGap = SustainedTriggerEvaluator.evaluate({ currentMacro: { fxGap: reading(50, CURRENT_AS_OF) }, priorAnalyses: [], targetDate: TARGET });
    expect(equalGap.find((r) => r.key === 'fxGap').status).toBe('not-satisfied');
  });

  it('dates observations by the reading asOf and keeps one per date (later analysis wins)', () => {
    const lagging = prior('2026-06-12', 850, { asOf: '2026-06-05' });
    const sameDay = [prior('2026-06-05', 700), prior('2026-06-06', 850, { asOf: '2026-06-05' })];
    expect(rp(run([lagging]))).toMatchObject({ streakStart: '2026-06-05', heldDays: 14 });
    expect(rp(run(sameDay))).toMatchObject({ observations: 1, streakStart: '2026-06-05' });
  });

  it('ignores analyses dated on or after the target date and readings as new as the current one', () => {
    const history = [prior('2026-06-20', 700), prior('2026-06-27', 700), prior('2026-06-19', 700, { asOf: CURRENT_AS_OF })];
    expect(rp(run(history))).toMatchObject({ status: 'insufficient-history', observations: 0 });
  });
});

describe('US2 — unknown is not a break', () => {
  it('keeps the streak across an unavailable week, flagged as including unknown data', () => {
    const gap = [prior('2026-06-12', 850), unavailable('2026-06-05'), ...above(WEEKS.slice(2))];
    const withGap = rp(run(gap));
    const full = rp(run(above(WEEKS)));
    expect(withGap).toMatchObject({ status: 'met', heldDays: full.heldDays, durationMet: true, includesUnknown: true });
    expect(full.includesUnknown).toBe(false);
  });

  it('flags an unavailable week right behind the current reading', () => {
    expect(rp(run([unavailable('2026-06-12'), ...above(WEEKS.slice(1))]))).toMatchObject({ heldDays: 35, includesUnknown: true });
    // the same span fully observed gives the same count
    expect(rp(run(above(WEEKS))).heldDays).toBe(35);
  });

  it('does not let an unavailable week be the evidence that a streak ended', () => {
    const history = [prior('2026-06-12', 850), unavailable('2026-06-05'), prior('2026-05-29', 850)];
    expect(rp(run(history))).toMatchObject({ heldDays: 21, includesUnknown: true });
  });

  it('adds nothing for unknown weeks at the old end or beyond a violation', () => {
    const oldEnd = [prior('2026-06-12', 850), unavailable('2026-06-05'), unavailable('2026-05-29')];
    expect(rp(run(oldEnd))).toMatchObject({ heldDays: 7, streakStart: '2026-06-12', includesUnknown: false });
    const beyondViolation = [prior('2026-06-12', 850), prior('2026-06-05', 700), unavailable('2026-05-29')];
    expect(rp(run(beyondViolation))).toMatchObject({ heldDays: 7, includesUnknown: false, historyLimited: false });
  });

  it('ignores failed runs, missing panels, missing indicators and non-numeric values without throwing', () => {
    const junk = [
      { date: '2026-06-12', status: 'failed', macroContext: { riesgoPais: reading(100, '2026-06-12') } },
      { date: '2026-06-05', status: 'completed', macroContext: null },
      { date: '2026-05-29', status: 'completed', macroContext: {} },
      { date: '2026-05-22', status: 'completed', macroContext: { riesgoPais: { value: 'n/a', available: true } } },
      null,
      { status: 'completed' },
    ];
    expect(rp(run(junk))).toMatchObject({ status: 'insufficient-history', observations: 0, heldDays: 0 });
  });

  it('reports unknown, never FIRED, when the current reading is unavailable', () => {
    const row = rp(run(above(WEEKS), { riesgoPais: { value: null, available: false } }));
    expect(row).toMatchObject({ status: 'unknown', durationMet: false, heldDays: 0, currentValue: null });
    expect(row.note).toMatch(/unavailable/);
    expect(rp(run(above(WEEKS), null))).toMatchObject({ status: 'unknown', durationMet: false });
  });

  it('reports a gross reserves reading as not evaluable, never as not satisfied', () => {
    const gross = reading(-5, CURRENT_AS_OF, { basis: 'gross' });
    const row = SustainedTriggerEvaluator.evaluate({ currentMacro: { bcraReserves: gross }, priorAnalyses: [], targetDate: TARGET })
      .find((r) => r.key === 'bcraReserves');
    expect(row).toMatchObject({ status: 'not-evaluable', durationMet: false });
    expect(row.note).toMatch(/gross/);
    const noBasis = SustainedTriggerEvaluator.evaluate({ currentMacro: { bcraReserves: reading(-5, CURRENT_AS_OF) }, priorAnalyses: [], targetDate: TARGET })
      .find((r) => r.key === 'bcraReserves');
    expect(noBasis.status).toBe('not-evaluable');
  });

  it('treats prior readings on the wrong basis as unusable', () => {
    const current = { bcraReserves: reading(-5, CURRENT_AS_OF, { basis: 'net' }) };
    const grossPrior = { date: '2026-06-12', status: 'completed', macroContext: { bcraReserves: reading(-9, '2026-06-12', { basis: 'gross' }) } };
    const row = SustainedTriggerEvaluator.evaluate({ currentMacro: current, priorAnalyses: [grossPrior], targetDate: TARGET })
      .find((r) => r.key === 'bcraReserves');
    expect(row).toMatchObject({ status: 'insufficient-history', observations: 0 });
  });
});

describe('US3 — first run and thin history', () => {
  it('reports insufficient history, never FIRED, with no prior analyses', () => {
    for (const none of [[], null, undefined]) {
      expect(rp(run(none))).toMatchObject({ status: 'insufficient-history', heldDays: 0, durationMet: false, observations: 0, currentValue: 850 });
    }
  });

  it('is not FIRED when history is shorter than the window, and flags the lower bound', () => {
    const row = rp(run([prior('2026-06-09', 850)]));
    expect(row).toMatchObject({ status: 'building', heldDays: 10, daysRemaining: 20, durationMet: false, historyLimited: true });
  });

  it('flags a streak that reaches the oldest stored observation as a lower bound', () => {
    expect(rp(run(above(WEEKS)))).toMatchObject({ historyLimited: true });
  });

  it('never throws on missing or malformed input', () => {
    expect(() => SustainedTriggerEvaluator.evaluate()).not.toThrow();
    expect(() => SustainedTriggerEvaluator.evaluate({ currentMacro: 'x', priorAnalyses: 'y', targetDate: 5 })).not.toThrow();
    expect(SustainedTriggerEvaluator.evaluate({ currentMacro: null }).every((r) => r.durationMet === false)).toBe(true);
  });

  it('falls back to the target date for an undated current reading', () => {
    const row = rp(SustainedTriggerEvaluator.evaluate({
      currentMacro: { riesgoPais: { value: 850, available: true } },
      priorAnalyses: [prior('2026-06-13', 850)],
      targetDate: TARGET,
    }));
    expect(row).toMatchObject({ currentAsOf: TARGET, heldDays: 7 });
  });
});
