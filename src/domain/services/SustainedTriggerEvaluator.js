/**
 * SustainedTriggerEvaluator (feature 021)
 *
 * Pure domain service: for each framework "sustained Nd" macro trigger, works out
 * from the current macro panel plus prior analyses' stored panels how many days
 * the condition has held, ending at the current reading. The weekly analysis
 * hands the result to the model so it can report FIRED only when the duration
 * is really met (the model never counts days itself).
 *
 * Walk, newest prior observation first, from the current reading:
 *   - satisfying   -> extends the streak (its date becomes the streak start)
 *   - violating    -> ends it
 *   - unusable     -> skipped, NEVER a break (unavailable, missing, non-numeric,
 *                     wrong basis, failed run). Marks the span `includesUnknown`
 *                     only when a satisfying observation is found beyond it.
 * Comparisons are strict ("above 800", "below 0"). One observation per date.
 *
 * The BCRA trigger is about NET reserves but the macro source is GROSS, so it
 * reports `not-evaluable` rather than a misleading "not satisfied".
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Framework v3.1 §5 sustained triggers, in display order.
 * `requiredBasis` is the reading basis the trigger is defined on (null = any).
 */
const TRIGGERS = Object.freeze([
  { key: 'riesgoPais', label: 'Riesgo país', unit: 'bp', comparator: '>', threshold: 800, requiredDays: 30, requiredBasis: null },
  { key: 'fxGap', label: 'MEP/official gap', unit: '%', comparator: '>', threshold: 50, requiredDays: 30, requiredBasis: null },
  { key: 'bcraReserves', label: 'BCRA net reserves', unit: 'USD M', comparator: '<', threshold: 0, requiredDays: 30, requiredBasis: 'net' },
].map(Object.freeze));

const MAX_REQUIRED_DAYS = Math.max(...TRIGGERS.map((t) => t.requiredDays));

const isIsoDate = (s) => typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

function satisfies(def, value) {
  return def.comparator === '>' ? value > def.threshold : value < def.threshold;
}

/**
 * Read one indicator from a macro panel.
 * @returns {{state:'ok'|'unusable'|'basis-mismatch', value?:number, asOf?:string|null, basis?:string|null}}
 */
function readIndicator(macro, def) {
  const r = macro && typeof macro === 'object' ? macro[def.key] : null;
  if (!r || typeof r !== 'object' || r.available === false
    || typeof r.value !== 'number' || !Number.isFinite(r.value)) {
    return { state: 'unusable' };
  }
  if (def.requiredBasis && r.basis !== def.requiredBasis) {
    return { state: 'basis-mismatch', basis: r.basis || null };
  }
  return { state: 'ok', value: r.value, asOf: isIsoDate(r.asOf) ? r.asOf : null };
}

function baseResult(def) {
  return {
    key: def.key,
    label: def.label,
    unit: def.unit,
    comparator: def.comparator,
    threshold: def.threshold,
    requiredDays: def.requiredDays,
    currentValue: null,
    currentAsOf: null,
    status: 'unknown',
    heldDays: 0,
    durationMet: false,
    daysRemaining: null,
    streakStart: null,
    includesUnknown: false,
    historyLimited: false,
    observations: 0,
    note: null,
  };
}

/**
 * Usable-or-not observation per prior completed analysis, one per date (the
 * later analysis wins), dated by the reading's own asOf (fallback: the analysis
 * date), strictly older than the current reading, newest first.
 */
function priorObservations(def, priorAnalyses, targetDate, currentDate) {
  const byDate = new Map();
  for (const a of Array.isArray(priorAnalyses) ? priorAnalyses : []) {
    if (!a || a.status !== 'completed' || !isIsoDate(a.date)) continue;
    if (isIsoDate(targetDate) && a.date >= targetDate) continue;
    const r = readIndicator(a.macroContext, def);
    const date = r.state === 'ok' && r.asOf ? r.asOf : a.date;
    if (date >= currentDate) continue; // same or newer than the current reading: not history
    const state = r.state !== 'ok' ? 'unusable' : (satisfies(def, r.value) ? 'sat' : 'viol');
    const prev = byDate.get(date);
    // Same reading date twice: a usable reading beats an unusable one, otherwise the later analysis wins.
    const better = !prev
      || (state !== 'unusable') > (prev.state !== 'unusable')
      || ((state !== 'unusable') === (prev.state !== 'unusable') && a.date > prev.analysisDate);
    if (better) byDate.set(date, { date, state, analysisDate: a.date });
  }
  return [...byDate.values()].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
}

class SustainedTriggerEvaluator {
  /**
   * @param {Object} input
   * @param {Object|null} input.currentMacro - this run's macro panel (macroContext readings).
   * @param {Array<{date:string,status:string,macroContext:Object|null}>} input.priorAnalyses
   * @param {string} [input.targetDate] - ISO date of the run; fallback date for an undated
   *   current reading and upper bound (exclusive) for history.
   * @returns {Array<Object>} one SustainedTriggerResult per definition, in definition order.
   */
  static evaluate({ currentMacro = null, priorAnalyses = [], targetDate = null } = {}) {
    return TRIGGERS.map((def) => SustainedTriggerEvaluator._evaluateOne(def, currentMacro, priorAnalyses, targetDate));
  }

  static _evaluateOne(def, currentMacro, priorAnalyses, targetDate) {
    const out = baseResult(def);
    const cur = readIndicator(currentMacro, def);

    if (cur.state === 'basis-mismatch') {
      out.status = 'not-evaluable';
      out.note = `reading basis is ${cur.basis || 'unspecified'}; ${def.requiredBasis} required`;
      return out;
    }
    const currentDate = cur.state === 'ok' ? (cur.asOf || (isIsoDate(targetDate) ? targetDate : null)) : null;
    if (cur.state !== 'ok' || !currentDate) {
      out.status = 'unknown';
      out.note = cur.state !== 'ok' ? 'current reading unavailable' : 'current reading has no as-of date';
      return out;
    }

    out.currentValue = cur.value;
    out.currentAsOf = currentDate;
    if (!satisfies(def, cur.value)) {
      out.status = 'not-satisfied';
      return out;
    }

    let streakStart = null;
    let pendingUnknown = false;
    let stopped = false;
    let usable = 0;
    for (const obs of priorObservations(def, priorAnalyses, targetDate, currentDate)) {
      if (obs.state === 'unusable') { pendingUnknown = true; continue; }
      usable += 1;
      if (obs.state === 'viol') { stopped = true; break; }
      streakStart = obs.date;
      if (pendingUnknown) { out.includesUnknown = true; pendingUnknown = false; }
    }

    out.observations = usable;
    if (usable === 0) {
      out.status = 'insufficient-history';
      return out;
    }
    out.streakStart = streakStart;
    out.heldDays = streakStart ? Math.max(0, dayNumber(currentDate) - dayNumber(streakStart)) : 0;
    // Ran off the end of the stored history while still satisfying: a lower bound.
    out.historyLimited = !stopped && streakStart !== null;
    out.durationMet = out.heldDays >= def.requiredDays;
    out.status = out.durationMet ? 'met' : 'building';
    out.daysRemaining = out.durationMet ? null : def.requiredDays - out.heldDays;
    return out;
  }
}

SustainedTriggerEvaluator.TRIGGERS = TRIGGERS;
SustainedTriggerEvaluator.MAX_REQUIRED_DAYS = MAX_REQUIRED_DAYS;

module.exports = SustainedTriggerEvaluator;
