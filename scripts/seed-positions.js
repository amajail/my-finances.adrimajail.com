#!/usr/bin/env node
/**
 * Seed positions from a JSON file against the local API.
 * Idempotent: treats "already exists" (502 from createEntity 409) as success.
 *
 * Reads scripts/positions.json by default; override with POSITIONS_FILE env var.
 *   node scripts/seed-positions.js
 *   POSITIONS_FILE=scripts/positions.template.json node scripts/seed-positions.js
 *
 * Override base URL with API_BASE env var if needed.
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || 'http://localhost:7071/api';
const FILE = process.env.POSITIONS_FILE || path.join(__dirname, 'positions.json');

if (!fs.existsSync(FILE)) {
  console.error(`Positions file not found: ${FILE}`);
  console.error(`Copy scripts/positions.template.json → scripts/positions.json and fill it in.`);
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (!Array.isArray(raw)) {
  console.error(`${FILE} must be a JSON array of position objects.`);
  process.exit(2);
}

// Strip metadata / comment-only entries (all keys start with underscore)
const positions = raw.filter(row => Object.keys(row).some(k => !k.startsWith('_')));

async function send(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, body: json, raw: text };
}

function isAlreadyExists(res) {
  if (!res.body) return false;
  return String(res.body.error || '').toLowerCase().includes('already exists');
}

function tag(row) {
  return `${row.brokerId || '?'}/${row.symbol || '?'}`;
}

(async () => {
  console.log(`\n→ Seeding ${positions.length} positions from ${path.relative(process.cwd(), FILE)} to ${BASE}/positions`);
  const start = Date.now();
  let created = 0, existed = 0, failed = 0;
  const failures = [];

  for (const row of positions) {
    // Strip leading-underscore keys (template hints) just in case
    const body = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_')));
    const res = await send('POST', '/positions', body);
    if (res.status === 201) {
      console.log(`  ✓ created: ${tag(row)}`);
      created++;
    } else if (res.status === 502 && isAlreadyExists(res)) {
      console.log(`  · exists:  ${tag(row)}`);
      existed++;
    } else {
      const msg = res.body?.error || res.raw || `HTTP ${res.status}`;
      console.log(`  ✗ failed:  ${tag(row)} → ${res.status} ${msg}`);
      if (res.body?.details) {
        for (const d of res.body.details) console.log(`            · ${d.field}: ${d.message}`);
      }
      failures.push({ tag: tag(row), status: res.status, msg });
      failed++;
    }
  }

  console.log(`\n  positions: ${created} created, ${existed} already existed, ${failed} failed`);
  console.log(`  Done in ${Date.now() - start}ms.`);
  if (failed > 0) {
    console.error(`\n${failed} failure(s). Exit 1.`);
    process.exit(1);
  }
})().catch(err => {
  console.error('\nUnhandled error:', err.message);
  if (err.cause) console.error('cause:', err.cause.message || err.cause);
  process.exit(2);
});
