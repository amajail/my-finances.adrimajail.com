// Feature 006: macro context, portfolio totals, and position changes since
// last week — the header-level summary blocks at the top of the analysis
// detail page. Extracted from analysis-detail.astro (was one big inline
// <script>) with no behavior change.

import { escapeHtml, fmtNumber, maskable } from '../format.js';

function show(el) { el.classList.remove('hidden'); }

const MACRO_GROUPS = [
  { title: 'Argentina', items: [
    { key: 'riesgoPais', label: 'Riesgo país', unit: 'bp' },
    { key: 'fxGap', label: 'MEP/official gap', unit: '%' },
    { key: 'bcraReserves', label: 'BCRA reserves', unit: 'USD M' },
    { key: 'argInflation', label: 'Monthly inflation', unit: '%' },
    { key: 'argInterestRate', label: 'Policy rate', unit: '%' },
  ] },
  { title: 'United States', items: [
    { key: 'usaInflation', label: 'CPI (YoY)', unit: '%' },
    { key: 'usaInterestRate', label: 'Fed funds (upper)', unit: '%' },
  ] },
  { title: 'Global / program', items: [
    { key: 'sp500Drawdown', label: 'S&P 500 drawdown', unit: '%' },
    { key: 'imfReviewStatus', label: 'IMF review', unit: '' },
  ] },
];

function fmtReading(r, unit) {
  if (!r || r.available === false || r.value === null || r.value === undefined) {
    return '<span class="text-[var(--color-muted)]">unavailable</span>';
  }
  const val = typeof r.value === 'number' ? r.value.toLocaleString() : escapeHtml(String(r.value));
  const basis = r.basis ? ` <span class="text-[var(--color-muted)]">(${escapeHtml(r.basis)})</span>` : '';
  const unitStr = unit ? ` ${escapeHtml(unit)}` : '';
  const asOf = r.asOf ? `<span class="text-xs text-[var(--color-muted)]"> · ${escapeHtml(r.asOf)}</span>` : '';
  return `<span class="num-mono">${val}${unitStr}</span>${basis}${asOf}`;
}

export function renderMacro(macro) {
  if (!macro) return;
  const container = document.getElementById('macro-groups');
  container.innerHTML = MACRO_GROUPS.map((g) => `
    <div>
      <h3 class="text-xs uppercase text-[var(--color-muted)] mb-2">${escapeHtml(g.title)}</h3>
      <dl class="space-y-1">
        ${g.items.map((it) => `
          <div class="flex justify-between gap-3 text-sm">
            <dt class="text-[var(--color-muted)]">${escapeHtml(it.label)}</dt>
            <dd class="text-right">${fmtReading(macro[it.key], it.unit)}</dd>
          </div>
        `).join('')}
      </dl>
    </div>
  `).join('');
  show(document.getElementById('macro-section'));
}

export function renderTotals(t) {
  if (!t) return;
  // Portfolio totals mask under privacy mode; the MEP rate is public data.
  const rows = [
    { label: 'Total USD', val: `USD ${maskable(fmtNumber(t.totalUsd))}` },
    { label: 'Total ARS', val: `ARS ${maskable(fmtNumber(t.totalArs))}` },
    { label: 'Grand total (USD)', val: `USD ${maskable(fmtNumber(t.grandTotalUsd))}` },
    { label: 'Unrealized P&L USD', val: `USD ${maskable(fmtNumber(t.unrealizedPnlUsd))}` },
    { label: 'Unrealized P&L ARS', val: `ARS ${maskable(fmtNumber(t.unrealizedPnlArs))}` },
    { label: 'MEP rate', val: `${fmtNumber(t.mepRate)}${t.mepRateAsOf ? ' · ' + escapeHtml(t.mepRateAsOf) : ''}` },
  ];
  document.getElementById('totals-grid').innerHTML = rows.map((r) => `
    <div>
      <div class="text-xs uppercase text-[var(--color-muted)]">${escapeHtml(r.label)}</div>
      <div class="num-mono">${r.val}</div>
    </div>
  `).join('');
  show(document.getElementById('totals-section'));
}

export function renderChanges(changes) {
  // null = unknown (no prior snapshot); [] = no changes; array = the deltas.
  if (changes === undefined) return;
  const note = document.getElementById('changes-note');
  const tbody = document.getElementById('changes-tbody');
  if (changes === null) {
    note.textContent = 'not available (no prior week to compare)';
  } else if (changes.length === 0) {
    note.textContent = 'no positions changed this week';
  } else {
    note.textContent = `${changes.length} changed`;
    const badge = (c) => (c === 'added' || c === 'increased') ? 'badge-success' : 'badge-pending';
    tbody.innerHTML = changes.map((c) => `
      <tr class="border-t border-[var(--color-border)]">
        <td class="px-4 py-2" data-label="Broker">${escapeHtml(c.broker)}</td>
        <td class="px-4 py-2 num-mono" data-label="Symbol">${escapeHtml(c.symbol)}</td>
        <td class="px-4 py-2" data-label="Change"><span class="badge ${badge(c.change)}">${escapeHtml(c.change)}</span></td>
        <td class="px-4 py-2 text-right num-mono" data-label="Before">${escapeHtml(String(c.quantityBefore))}</td>
        <td class="px-4 py-2 text-right num-mono" data-label="After">${escapeHtml(String(c.quantityAfter))}</td>
        <td class="px-4 py-2 text-right num-mono" data-label="Δ">${escapeHtml(String(c.deltaQuantity))}</td>
      </tr>
    `).join('');
  }
  show(document.getElementById('changes-section'));
}
