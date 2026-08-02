// Feature 007: suggested orders + execution status controls. Extracted from
// analysis-detail.astro with no behavior change. `renderOrders` takes a
// `reload` callback (the page's own `load()`) instead of calling a
// module-level `load()` directly, since it now lives outside the page script.

import { api } from '../api.js';
import { attempt } from '../load.js';
import { escapeHtml, maskable } from '../format.js';

function show(el) { el.classList.remove('hidden'); }

export const EXEC_STATUSES = ['pending', 'executed', 'partial', 'skipped'];

export function renderOrders(detail, date, reload) {
  show(document.getElementById('orders-section'));
  const frozenNote = detail.frozen ? ' · frozen' : '';
  document.getElementById('orders-count').textContent = `${detail.orders.length} suggested${frozenNote}`;

  document.getElementById('orders-tbody').innerHTML = detail.orders.map((o) => {
    const sel = EXEC_STATUSES.map((s) =>
      `<option value="${s}" ${s === o.executionStatus ? 'selected' : ''}>${s}</option>`).join('');
    const proposal = (o.executionStatus === 'pending' && o.proposedStatus)
      ? `<div class="text-xs text-[var(--color-muted)] mt-1">proposed: <button type="button" class="underline accept-one" data-index="${o.index}" data-proposed="${o.proposedStatus}">${escapeHtml(o.proposedStatus)}</button></div>`
      : '';
    const note = o.executionNote ? escapeHtml(o.executionNote) : '';
    return `
      <tr class="border-t border-[var(--color-border)]">
        <td class="px-4 py-2">${escapeHtml(o.broker)}</td>
        <td class="px-4 py-2 num-mono">${escapeHtml(o.symbol)}</td>
        <td class="px-4 py-2"><span class="badge ${o.side === 'buy' ? 'badge-success' : 'badge-pending'}">${escapeHtml(o.side)}</span></td>
        <td class="px-4 py-2 text-right num-mono">${maskable(escapeHtml(String(o.quantity)))}</td>
        <td class="px-4 py-2">${escapeHtml(o.conviction)}</td>
        <td class="px-4 py-2">
          <select class="exec-status text-sm bg-[var(--color-surface-2)] rounded px-1 py-0.5" data-index="${o.index}">${sel}</select>
          <input class="exec-note text-sm bg-[var(--color-surface-2)] rounded px-1 py-0.5 ml-1 w-32" data-index="${o.index}" maxlength="500" placeholder="note" value="${note}" />
          <button type="button" class="exec-save badge badge-pending ml-1" data-index="${o.index}">save</button>
          ${proposal}
        </td>
        <td class="px-4 py-2 text-[var(--color-text-primary)]">${escapeHtml(o.rationale)}</td>
      </tr>`;
  }).join('');

  const saveFor = async (index, status, note) => {
    const result = await attempt(
      () => api(`/analysis/weekly/${encodeURIComponent(date)}/orders/${index}`, {
        method: 'PATCH', body: { status, note },
      }),
      (err) => {
        const banner = document.getElementById('error-banner');
        banner.textContent = `Could not save status: ${err.message}`;
        show(banner);
      },
    );
    if (result === undefined) return;
    reload(); // reload to reflect saved status + frozen state authoritatively
  };

  document.querySelectorAll('.exec-save').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = btn.getAttribute('data-index');
      const status = document.querySelector(`.exec-status[data-index="${i}"]`).value;
      const note = document.querySelector(`.exec-note[data-index="${i}"]`).value;
      saveFor(i, status, note);
    });
  });
  document.querySelectorAll('.accept-one').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = btn.getAttribute('data-index');
      const note = document.querySelector(`.exec-note[data-index="${i}"]`).value;
      saveFor(i, btn.getAttribute('data-proposed'), note);
    });
  });
}
