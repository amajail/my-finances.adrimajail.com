import { amountsHidden } from '@amajail/ui/privacy';

// Privacy mode (the header eye, Layout.astro): while amounts are hidden the
// two money formatters return a fixed-width mask — same length for every
// value, so digit count leaks nothing. Percentages deliberately stay real.
// Sites that print money without these formatters mask through maskable().
export const maskable = text => amountsHidden() ? '••••••' : text;

export const fmtUsd = n => n == null ? '—' : amountsHidden() ? '$••••••' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const fmtArs = n => n == null ? '—' : amountsHidden() ? '$••••••' : `$${Math.round(Number(n)).toLocaleString('es-AR')}`;
export const fmtPct = n => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
export const pnlClass = n => n == null ? 'pos-neutral' : n >= 0 ? 'pos-positive' : 'pos-negative';

const BROKER_TYPE_LABELS = { broker: 'Broker', cash_holder: 'Cash holder' };
export const brokerTypeLabel = type => BROKER_TYPE_LABELS[type] || 'Broker';

// Escapes a value for safe interpolation into innerHTML template strings.
// Canonical implementation — previously redefined identically in
// analysis-detail.astro and analysis.astro, and (behaviorally equivalently,
// for every value actually passed to it) in instructions.astro.
export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Plain locale-formatted number (no currency symbol), max 2 decimals, or '—'
// when not a number. Previously `money()` in analysis-detail.astro.
export const fmtNumber = v => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';

// Human-readable local timestamp from an ISO string, falling back to the raw
// input if it doesn't parse. Previously local to instructions.astro.
export function fmtTimestamp(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// Byte count as "N B" / "N.N KB". Previously local to instructions.astro.
export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
