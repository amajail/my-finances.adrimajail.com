// Feature 013 (administrative / non-investable positions) and Feature 014
// (cross-broker duplicate holdings) sections of the analysis detail page.
// Both are omitted entirely when there's nothing to show. Extracted from
// analysis-detail.astro with no behavior change.

import { escapeHtml, maskable } from '../format.js';

function show(el) { el.classList.remove('hidden'); }

export function renderAdministrative(rows) {
  // [] / absent / malformed → omit the section entirely (FR-009).
  if (!Array.isArray(rows) || rows.length === 0) return;
  document.getElementById('admin-note').textContent = `${rows.length} excluded (value ≤ 0)`;
  document.getElementById('admin-tbody').innerHTML = rows.map((p) => `
    <tr class="border-t border-[var(--color-border)]">
      <td class="px-4 py-2" data-label="Broker">${escapeHtml(p.broker)}</td>
      <td class="px-4 py-2" data-label="Type">${escapeHtml(p.assetType)}</td>
      <td class="px-4 py-2 num-mono" data-label="Symbol">${escapeHtml(p.symbol)}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Qty">${maskable(escapeHtml(String(p.quantity)))}</td>
      <td class="px-4 py-2 text-right num-mono" data-label="Value USD">${maskable(escapeHtml(String(p.valueUsd)))}</td>
    </tr>
  `).join('');
  show(document.getElementById('admin-section'));
}

export function renderDuplications(groups) {
  // null / [] / absent / malformed → omit the section entirely (FR-011).
  if (!Array.isArray(groups) || groups.length === 0) return;
  document.getElementById('dups-note').textContent = `${groups.length} duplicated`;
  document.getElementById('dups-tbody').innerHTML = groups.map((g) => {
    const placements = (g.placements || [])
      .map((p) => `${escapeHtml(p.broker)}/${escapeHtml(p.assetType)} (${maskable(escapeHtml(String(p.quantity)))})`)
      .join(', ');
    const label = g.label && g.label !== g.symbol
      ? `${escapeHtml(g.symbol)} <span class="text-[var(--color-muted)]">${escapeHtml(g.label)}</span>`
      : escapeHtml(g.symbol);
    return `
      <tr class="border-t border-[var(--color-border)]">
        <td class="px-4 py-2 num-mono">${label}</td>
        <td class="px-4 py-2">${placements}</td>
        <td class="px-4 py-2 text-right num-mono">${escapeHtml(String(g.placementCount))}</td>
        <td class="px-4 py-2 text-right num-mono">${maskable(escapeHtml(String(g.totalValueUsd)))}</td>
      </tr>`;
  }).join('');
  show(document.getElementById('dups-section'));
}
