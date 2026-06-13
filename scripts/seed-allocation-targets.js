#!/usr/bin/env node
/**
 * Seed the `analysis.allocationTargetsV1` row in `portfolioSettings` from a
 * local JSON file. The file is gitignored (`scripts/*.local.json`) — only the
 * example template at `scripts/allocation-targets.example.json` is committed
 * (Privacy First).
 *
 * IDEMPOTENT — insert-only (Constitution Principle III): if the settings row
 * already exists, this script SKIPS it (does not overwrite). To change targets
 * after the first seed, edit the row directly via the settings API/dashboard.
 *
 * Usage:
 *
 *   # First time: copy the example, edit with your real targets
 *   cp scripts/allocation-targets.example.json scripts/allocation-targets.local.json
 *   $EDITOR scripts/allocation-targets.local.json
 *
 *   # Push to the local function host
 *   node scripts/seed-allocation-targets.js
 *
 *   # Or push to prod
 *   API_BASE=https://my-fn.azurewebsites.net/api FN_KEY=... node scripts/seed-allocation-targets.js
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || 'http://localhost:7071/api';
const FN_KEY = process.env.FN_KEY || null;
const KEY = 'analysis.allocationTargetsV1';
const LOCAL_FILE = path.join(__dirname, 'allocation-targets.local.json');

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (FN_KEY) h['x-functions-key'] = FN_KEY;
  return h;
}

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error('Local targets file not found:', LOCAL_FILE);
    console.error('Copy scripts/allocation-targets.example.json to that path and edit it first.');
    process.exit(2);
  }

  const raw = fs.readFileSync(LOCAL_FILE, 'utf8').trim();
  if (!raw) {
    console.error('Local targets file is empty.');
    process.exit(2);
  }

  // Validate it parses + has the required top-level shape before sending.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Local targets file is not valid JSON:', err.message);
    process.exit(2);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.buckets) || parsed.buckets.length === 0) {
    console.error('Targets document must be an object with a non-empty `buckets` array.');
    process.exit(2);
  }

  // Idempotent: skip if the row already exists (insert-only).
  const existing = await fetch(`${BASE}/settings/${encodeURIComponent(KEY)}`, { headers: headers() });
  if (existing.status >= 200 && existing.status < 300) {
    console.log(`SKIP: ${KEY} already exists — not overwriting (insert-only seeder).`);
    return;
  }
  if (existing.status !== 404) {
    const text = await existing.text();
    console.error(`FAIL: unexpected status checking ${KEY}: HTTP ${existing.status} — ${text}`);
    process.exit(1);
  }

  const res = await fetch(`${BASE}/settings/${encodeURIComponent(KEY)}`, {
    method: 'PUT',
    headers: headers(),
    // Store the canonical (re-stringified) JSON so whitespace/comments are normalized.
    body: JSON.stringify({ value: JSON.stringify(parsed) }),
  });

  if (res.status >= 200 && res.status < 300) {
    console.log(`OK: ${KEY} seeded (${parsed.buckets.length} buckets).`);
    return;
  }
  const text = await res.text();
  console.error(`FAIL: HTTP ${res.status} — ${text}`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
