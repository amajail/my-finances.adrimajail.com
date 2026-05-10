#!/usr/bin/env node
/**
 * Seed brokers + mep_rate setting against the local API.
 * Idempotent: treats "already exists" (502 from createEntity 409) as success.
 *
 * Run after `npm start` in another terminal.
 *   node scripts/seed-brokers.js
 *
 * Override base URL with API_BASE env var if needed:
 *   API_BASE=http://localhost:7071/api node scripts/seed-brokers.js
 */

const BASE = process.env.API_BASE || 'http://localhost:7071/api';

// Example brokers — replace these with your own before running this script
// against a real environment. Add or remove rows as needed.
const BROKERS = [
  { id: 'broker1', displayName: 'Example Broker 1', type: 'broker',      accentColor: '#f0a500' },
  { id: 'broker2', displayName: 'Example Broker 2', type: 'broker',      accentColor: '#4f8ef7' },
  { id: 'cash',     displayName: 'Cash holdings',    type: 'cash_holder', accentColor: '#94a3b8' },
];

const SETTINGS = [
  { key: 'mep_rate', value: '1250' },
];

async function send(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, body: json, raw: text };
}

function isAlreadyExists(res) {
  if (!res.body) return false;
  const msg = String(res.body.error || '').toLowerCase();
  return msg.includes('already exists');
}

async function seedBrokers() {
  console.log(`\n→ Seeding ${BROKERS.length} brokers to ${BASE}/brokers`);
  let created = 0, existed = 0, failed = 0;
  for (const b of BROKERS) {
    const res = await send('POST', '/brokers', b);
    if (res.status === 201) {
      console.log(`  ✓ created: ${b.id}`);
      created++;
    } else if (res.status === 502 && isAlreadyExists(res)) {
      console.log(`  · exists:  ${b.id}`);
      existed++;
    } else {
      console.log(`  ✗ failed:  ${b.id} → ${res.status} ${res.raw}`);
      failed++;
    }
  }
  console.log(`  brokers: ${created} created, ${existed} already existed, ${failed} failed`);
  return failed;
}

async function seedSettings() {
  console.log(`\n→ Seeding ${SETTINGS.length} settings`);
  let ok = 0, failed = 0;
  for (const s of SETTINGS) {
    const res = await send('PUT', `/settings/${encodeURIComponent(s.key)}`, { value: s.value });
    if (res.status === 200) {
      console.log(`  ✓ ${s.key}=${s.value}`);
      ok++;
    } else {
      console.log(`  ✗ ${s.key} → ${res.status} ${res.raw}`);
      failed++;
    }
  }
  console.log(`  settings: ${ok} ok, ${failed} failed`);
  return failed;
}

(async () => {
  const start = Date.now();
  const failures = (await seedBrokers()) + (await seedSettings());
  console.log(`\nDone in ${Date.now() - start}ms.`);
  if (failures > 0) {
    console.error(`\n${failures} failure(s). Exit 1.`);
    process.exit(1);
  }
})().catch(err => {
  console.error('\nUnhandled error:', err.message);
  if (err.cause) console.error('cause:', err.cause.message || err.cause);
  process.exit(2);
});
