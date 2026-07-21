// Feature 012 (deterministic macro week-over-week) and Feature 010
// (code-computed drift/caps/watchlist/week-over-week/amendment tables) —
// the framework-driven analytical sections of the analysis detail page.
// Extracted from analysis-detail.astro with no behavior change.

import { escapeHtml } from '../format.js';

function show(el) { el.classList.remove('hidden'); }

export function renderMacroWow(rows) {
  // Absent / empty / malformed → omit the section (FR-008).
  if (!Array.isArray(rows) || rows.length === 0) return;
  const num = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—');
  const deltaCell = (n) => {
    if (typeof n !== 'number') return '<span class="num-mono">—</span>';
    const cls = n > 0 ? 'pos-positive' : (n < 0 ? 'pos-negative' : '');
    const sign = n > 0 ? '+' : '';
    return `<span class="num-mono ${cls}">${sign}${num(n)}</span>`;
  };
  const pctCell = (n) => {
    if (typeof n !== 'number') return '<span class="num-mono">—</span>';
    const cls = n > 0 ? 'pos-positive' : (n < 0 ? 'pos-negative' : '');
    const sign = n > 0 ? '+' : '';
    return `<span class="num-mono ${cls}">${sign}${n.toFixed(2)}%</span>`;
  };
  document.getElementById('macro-wow-tbody').innerHTML = rows.map((r) => `
    <tr class="border-t border-[var(--color-border)]">
      <td class="px-4 py-2" data-label="Indicator">${escapeHtml(r.label)}${r.unit ? ` <span class="text-xs text-[var(--color-muted)]">${escapeHtml(r.unit)}</span>` : ''}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Prior">${num(r.priorValue)}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Current">${num(r.currentValue)}</td>
      <td class="px-4 py-2 text-right" data-label="Δ">${deltaCell(r.deltaAbs)}</td>
      <td class="px-4 py-2 text-right" data-label="%">${pctCell(r.deltaPct)}</td>
    </tr>`).join('');
  show(document.getElementById('macro-wow-section'));
}

export function renderDrift(rows, tbodyId, sectionId, firstColLabel) {
  // Absent / empty / malformed → omit the section (FR-008).
  if (!Array.isArray(rows) || rows.length === 0) return;
  const pctCell = (n) => (typeof n === 'number' ? n.toFixed(2) + '%' : '—');
  const driftCell = (n) => {
    if (typeof n !== 'number') return '<span class="num-mono">—</span>';
    const cls = n > 0 ? 'pos-positive' : (n < 0 ? 'pos-negative' : '');
    const sign = n > 0 ? '+' : '';
    return `<span class="num-mono ${cls}">${sign}${n.toFixed(2)}%</span>`;
  };
  document.getElementById(tbodyId).innerHTML = rows.map((r) => `
    <tr class="border-t border-[var(--color-border)]">
      <td class="px-4 py-2" data-label="${firstColLabel}">${escapeHtml(r.label)}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Target %">${pctCell(r.targetPct)}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Current %">${pctCell(r.currentPct)}</td>
      <td class="px-4 py-2 text-right" data-label="Drift">${driftCell(r.driftPct)}</td>
    </tr>`).join('');
  show(document.getElementById(sectionId));
}

export function renderCaps(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const pctCell = (n) => (typeof n === 'number' ? n.toFixed(2) + '%' : '—');
  const breachBadge = (b) => {
    if (b === 'hard') return '<span class="badge badge-pending pos-negative">hard</span>';
    if (b === 'soft') return '<span class="badge badge-pending">soft</span>';
    return '<span class="badge badge-success">ok</span>';
  };
  document.getElementById('caps-tbody').innerHTML = rows.map((c) => `
    <tr class="border-t border-[var(--color-border)]">
      <td class="px-4 py-2" data-label="Cap">${escapeHtml(c.label)}</td>
      <td class="px-4 py-2" data-label="Scope">${escapeHtml(c.scope)}${c.bucketKey ? ' · ' + escapeHtml(c.bucketKey) : ''}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Soft %">${pctCell(c.softPct)}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Hard %">${pctCell(c.hardPct)}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Current %">${pctCell(c.currentPct)}</td>
      <td class="px-4 py-2" data-label="Breach">${breachBadge(c.breach)}</td>
    </tr>`).join('');
  show(document.getElementById('caps-section'));
}

export function renderWatchlist(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  document.getElementById('watchlist-tbody').innerHTML = rows.map((w) => `
    <tr class="border-t border-[var(--color-border)]">
      <td class="px-4 py-2" data-label="Item">${escapeHtml(w.item)}</td>
      <td class="px-4 py-2" data-label="Trigger">${escapeHtml(w.trigger)}</td>
      <td class="px-4 py-2" data-label="Severity">${w.severity ? escapeHtml(w.severity) : '—'}</td>
    </tr>`).join('');
  show(document.getElementById('watchlist-section'));
}

export function renderWeekOverWeek(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  document.getElementById('wow-tbody').innerHTML = rows.map((d) => `
    <tr class="border-t border-[var(--color-border)]">
      <td class="px-4 py-2" data-label="Metric">${escapeHtml(d.metric)}</td>
      <td class="px-4 py-2 num-mono" data-label="Prior">${escapeHtml(String(d.prior))}</td>
      <td class="px-4 py-2 num-mono" data-label="Current">${escapeHtml(String(d.current))}</td>
      <td class="px-4 py-2" data-label="Direction">${escapeHtml(d.direction || '')}</td>
    </tr>`).join('');
  show(document.getElementById('wow-section'));
}

export function renderAmendments(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  document.getElementById('amendments-tbody').innerHTML = rows.map((a) => `
    <tr class="border-t border-[var(--color-border)]">
      <td class="px-4 py-2 align-top" data-label="Proposal">${escapeHtml(a.proposal)}</td>
      <td class="px-4 py-2 align-top text-[var(--color-text-primary)]" data-label="Rationale">${escapeHtml(a.rationale)}</td>
    </tr>`).join('');
  show(document.getElementById('amendments-section'));
}
