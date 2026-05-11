export const fmtUsd = n => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const fmtArs = n => n == null ? '—' : `$${Math.round(Number(n)).toLocaleString('es-AR')}`;
export const fmtPct = n => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
export const pnlClass = n => n == null ? 'pos-neutral' : n >= 0 ? 'pos-positive' : 'pos-negative';

const BROKER_TYPE_LABELS = { broker: 'Broker', cash_holder: 'Cash holder' };
export const brokerTypeLabel = type => BROKER_TYPE_LABELS[type] || 'Broker';
