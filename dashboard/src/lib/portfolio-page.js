import { api } from './api.js';
import { fmtUsd, fmtArs, fmtPct, pnlClass, brokerTypeLabel } from './format.js';
import { effectivePrice, marketValue, costBasis } from './pricing.js';

// Per-broker positions table state: rows + active sort + active asset filter.
// Each broker's table re-renders from its own state when the user sorts or
// changes the asset filter, so the two interactions compose cleanly.
const brokerState = new Map();

const SORT_ACCESSORS = {
  symbol:      r => r.p.symbol,
  quantity:    r => r.p.quantity,
  averageCost: r => r.p.averageCost,
  price:       r => r.price,
  value:       r => r.mv,
  pnl:         r => r.pnl,
  pct:         r => r.pct,
};

function buildBrokerRows(positions) {
  return positions.map(p => {
    const cb = costBasis(p);
    const price = effectivePrice(p);
    const mv = marketValue(p);
    const pnl = mv != null ? mv - cb : null;
    const pct = (cb > 0 && pnl != null) ? (pnl / cb) * 100 : null;
    return { p, price, mv, pnl, pct };
  });
}

function sortRows(rows, sortKey, sortDir) {
  if (!sortKey) return rows;
  const get = SORT_ACCESSORS[sortKey];
  if (!get) return rows;
  const sign = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = get(a), bv = get(b);
    // Nulls always sort last regardless of direction.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * sign;
    return (av - bv) * sign;
  });
}

function brokerRowHtml({ p, price, mv, pnl, pct }) {
  return `
    <tr class="border-t border-[var(--color-border)]" data-asset-type="${p.assetType}">
      <td class="px-4 py-2"><span class="font-semibold">${p.symbol}</span> <span class="text-xs text-[var(--color-muted)]">${p.assetType}</span></td>
      <td class="px-4 py-2 text-right num-mono">${p.quantity}</td>
      <td class="px-4 py-2 text-right num-mono">${p.averageCost.toFixed(2)} ${p.currency}</td>
      <td class="px-4 py-2 text-right num-mono">${price != null ? price.toFixed(2) : '—'}</td>
      <td class="px-4 py-2 text-right num-mono">${mv != null ? mv.toFixed(0) + ' ' + p.currency : '—'}</td>
      <td class="px-4 py-2 text-right num-mono ${pnlClass(pnl)}">${pnl != null ? pnl.toFixed(0) : '—'}</td>
      <td class="px-4 py-2 text-right num-mono ${pnlClass(pct)}">${fmtPct(pct)}</td>
    </tr>
  `;
}

function renderBrokerRows(brokerId) {
  const state = brokerState.get(brokerId);
  if (!state) return;
  const table = document.querySelector(`[data-broker-table="${brokerId}"]`);
  if (!table) return;
  const filtered = state.activeAsset === 'all'
    ? state.rows
    : state.rows.filter(r => r.p.assetType === state.activeAsset);
  const sorted = sortRows(filtered, state.sortKey, state.sortDir);
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = sorted.length
    ? sorted.map(brokerRowHtml).join('')
    : '<tr><td colspan="7" class="px-4 py-6 text-center text-sm text-[var(--color-muted)]">No matching positions.</td></tr>';
  table.querySelectorAll('th[data-sort-key] .sort-indicator').forEach(span => {
    const key = span.parentElement.dataset.sortKey;
    span.textContent = key === state.sortKey ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
  });
}

function attachSortHandlers(brokerId) {
  const table = document.querySelector(`[data-broker-table="${brokerId}"]`);
  if (!table) return;
  table.querySelectorAll('th[data-sort-key]').forEach(th => {
    th.addEventListener('click', () => {
      const state = brokerState.get(brokerId);
      if (!state) return;
      const key = th.dataset.sortKey;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      renderBrokerRows(brokerId);
    });
  });
}

function renderStatCell(label, value, sub = '') {
  return `
    <div class="stat-cell">
      <div class="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-1">${label}</div>
      <div class="text-lg font-bold num-mono">${value}</div>
      ${sub ? `<div class="text-xs text-[var(--color-muted)] mt-0.5">${sub}</div>` : ''}
    </div>
  `;
}

async function load() {
  try {
    const [summary, brokersRes, positionsRes] = await Promise.all([
      api('/portfolio/summary'),
      api('/brokers'),
      api('/positions?status=open'),
    ]);

    const brokerById = Object.fromEntries(brokersRes.brokers.map(b => [b.id, b]));
    const positions = positionsRes.positions || [];

    // Recompute currency and per-broker totals on the client so cash and
    // deposit positions (which often lack a currentPrice) are counted.
    const totalByCurrency = {};
    const totalByBroker = {};
    for (const p of positions) {
      const mv = marketValue(p) || 0;
      totalByCurrency[p.currency] = (totalByCurrency[p.currency] || 0) + mv;

      const t = totalByBroker[p.brokerId] ||= { native: {} };
      t.native[p.currency] = (t.native[p.currency] || 0) + mv;
    }

    // Grand total: keep the backend's USD figure (uses MEP rate); refresh
    // timestamp comes from the summary too.
    document.getElementById('grand-total').textContent = fmtUsd(summary.grandTotalUsd);
    document.getElementById('last-refresh').textContent = summary.lastPriceRefreshAt
      ? new Date(summary.lastPriceRefreshAt).toLocaleString()
      : 'Never';

    // Stat row
    const pnlUsd = summary.unrealizedPnlByCurrency?.USD || 0;
    const pnlArs = summary.unrealizedPnlByCurrency?.ARS || 0;
    document.getElementById('stat-row').innerHTML = [
      renderStatCell('Total USD positions', fmtUsd(totalByCurrency.USD || 0)),
      renderStatCell('Total ARS positions', fmtArs(totalByCurrency.ARS || 0), 'in ARS'),
      renderStatCell('Unrealized P&L (USD)', `<span class="${pnlClass(pnlUsd)}">${fmtUsd(pnlUsd)}</span>`),
      renderStatCell('Unrealized P&L (ARS)', `<span class="${pnlClass(pnlArs)}">${fmtArs(pnlArs)}</span>`),
    ].join('');

    // Broker cards — show ARS and USD totals side by side, in their native currency.
    const brokerEntries = Object.entries(totalByBroker);
    document.getElementById('brokers-section').innerHTML = brokerEntries.map(([brokerId, totals]) => {
      const broker = brokerById[brokerId] || { displayName: brokerId, accentColor: 'var(--color-accent)' };
      const accent = broker.accentColor || 'var(--color-accent)';
      const usdNative = totals.native.USD;
      const arsNative = totals.native.ARS;
      const showUsd = usdNative != null && usdNative !== 0;
      const showArs = arsNative != null && arsNative !== 0;
      const empty = !showUsd && !showArs;
      return `
        <div class="card" style="border-top: 3px solid ${accent}">
          <div class="p-4">
            <div class="text-xs uppercase tracking-wider text-[var(--color-muted)]">${brokerTypeLabel(broker.type)}</div>
            <div class="text-lg font-bold mb-3">${broker.displayName}</div>
            ${empty ? '<div class="text-sm text-[var(--color-muted)]">No open positions</div>' : `
              <div class="flex flex-wrap gap-x-6 gap-y-1">
                ${showUsd ? `
                  <div>
                    <div class="text-xs text-[var(--color-muted)] uppercase tracking-wider">USD</div>
                    <div class="text-2xl font-bold num-mono">${fmtUsd(usdNative)}</div>
                  </div>
                ` : ''}
                ${showArs ? `
                  <div>
                    <div class="text-xs text-[var(--color-muted)] uppercase tracking-wider">ARS</div>
                    <div class="text-2xl font-bold num-mono">${fmtArs(arsNative)}</div>
                  </div>
                ` : ''}
              </div>
            `}
          </div>
        </div>
      `;
    }).join('') || '<div class="text-sm text-[var(--color-muted)]">No brokers yet — add one in the Brokers page.</div>';

    // Per-broker positions tables
    const byBroker = {};
    for (const p of positions) {
      (byBroker[p.brokerId] ||= []).push(p);
    }

    const positionBrokerEntries = Object.entries(byBroker);
    brokerState.clear();

    document.getElementById('positions-by-broker').innerHTML = positionBrokerEntries.map(([brokerId, brokerPositions]) => {
      const broker = brokerById[brokerId] || { displayName: brokerId };
      const assetTypes = [...new Set(brokerPositions.map(p => p.assetType))].sort();
      const filterPills = assetTypes.length > 1
        ? `
          <div class="px-4 py-2 border-b border-[var(--color-border)] flex flex-wrap gap-1.5" data-broker-filter="${brokerId}">
            <button class="row-action-btn asset-filter-btn !bg-[var(--color-accent)] !text-white !border-transparent" data-asset="all">All</button>
            ${assetTypes.map(t => `<button class="row-action-btn asset-filter-btn" data-asset="${t}">${t}</button>`).join('')}
          </div>
        `
        : '';
      return `
        <div class="card">
          <div class="card-strip" style="background: ${broker.accentColor || 'var(--color-accent)'}"></div>
          <div class="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 class="font-semibold">${broker.displayName}</h3>
            <span class="text-xs text-[var(--color-muted)]">${brokerPositions.length} position${brokerPositions.length === 1 ? '' : 's'}</span>
          </div>
          ${filterPills}
          <table class="w-full text-sm" data-broker-table="${brokerId}">
            <thead class="bg-[var(--color-surface-2)]">
              <tr class="text-xs uppercase text-[var(--color-muted)]">
                <th class="text-left px-4 py-2 sort-th" data-sort-key="symbol">Symbol<span class="sort-indicator"></span></th>
                <th class="text-right px-4 py-2 sort-th" data-sort-key="quantity">Qty<span class="sort-indicator"></span></th>
                <th class="text-right px-4 py-2 sort-th" data-sort-key="averageCost">PPC<span class="sort-indicator"></span></th>
                <th class="text-right px-4 py-2 sort-th" data-sort-key="price">Last<span class="sort-indicator"></span></th>
                <th class="text-right px-4 py-2 sort-th" data-sort-key="value">Value<span class="sort-indicator"></span></th>
                <th class="text-right px-4 py-2 sort-th" data-sort-key="pnl">P&L<span class="sort-indicator"></span></th>
                <th class="text-right px-4 py-2 sort-th" data-sort-key="pct">%<span class="sort-indicator"></span></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;
    }).join('') || '<div class="text-sm text-[var(--color-muted)]">No open positions yet.</div>';

    for (const [brokerId, brokerPositions] of positionBrokerEntries) {
      brokerState.set(brokerId, {
        rows: buildBrokerRows(brokerPositions),
        sortKey: null,
        sortDir: 'asc',
        activeAsset: 'all',
      });
      renderBrokerRows(brokerId);
      attachSortHandlers(brokerId);
    }

    attachAssetFilters();

    // Top / bottom performers
    const renderPerf = (title, list, variant) => `
      <div class="card p-4">
        <div class="eyebrow mb-2">${title}</div>
        ${list && list.length
          ? '<ul class="space-y-2">' + list.map(p => `
              <li class="flex items-center justify-between text-sm">
                <span><strong>${p.symbol}</strong> <span class="text-xs text-[var(--color-muted)]">${p.brokerId}</span></span>
                <span class="badge badge-${variant} num-mono">${fmtPct(p.pnlPercent)}</span>
              </li>
            `).join('') + '</ul>'
          : '<div class="text-sm text-[var(--color-muted)]">Not enough data yet.</div>'}
      </div>
    `;

    const toPerfShape = list => (list || []).map(p => {
      const cb = costBasis(p);
      const mv = marketValue(p);
      const pnl = mv != null ? mv - cb : null;
      const pct = (cb > 0 && pnl != null) ? (pnl / cb) * 100 : null;
      return { symbol: p.symbol, brokerId: p.brokerId, pnlPercent: pct };
    });

    document.getElementById('top-performers').innerHTML    = renderPerf('Top performers',    toPerfShape(summary.topPerformers),    'success');
    document.getElementById('bottom-performers').innerHTML = renderPerf('Bottom performers', toPerfShape(summary.bottomPerformers), 'failed');

  } catch (err) {
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      `<div class="card p-4 mb-4 border-l-4 border-l-red-500"><strong>Failed to load:</strong> ${err.message}</div>`);
  }
}

function attachAssetFilters() {
  document.querySelectorAll('[data-broker-filter]').forEach(group => {
    const brokerId = group.dataset.brokerFilter;
    group.querySelectorAll('.asset-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const asset = btn.dataset.asset;
        group.querySelectorAll('.asset-filter-btn').forEach(b => {
          b.classList.remove('!bg-[var(--color-accent)]', '!text-white', '!border-transparent');
        });
        btn.classList.add('!bg-[var(--color-accent)]', '!text-white', '!border-transparent');
        const state = brokerState.get(brokerId);
        if (!state) return;
        state.activeAsset = asset;
        renderBrokerRows(brokerId);
      });
    });
  });
}

function attachRefreshButton() {
  document.getElementById('refresh-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Refreshing…';
    try {
      const result = await api('/prices/refresh', { method: 'POST' });
      e.target.textContent = `Refreshed: ${result.succeeded}/${result.totalSymbols}`;
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      e.target.textContent = 'Refresh failed';
      console.error(err);
    }
  });
}

export function initPortfolioPage() {
  attachRefreshButton();
  load();
}
