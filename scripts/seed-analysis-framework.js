#!/usr/bin/env node
/**
 * Seed the `analysis.strategicFrameworkV1` row in `portfolioSettings` from a
 * local markdown file. The file is gitignored — only the example template at
 * `scripts/seed-analysis-framework.example.md` is committed.
 *
 * ⚠️ ONE-TIME BOOTSTRAP ONLY (since feature 004).
 *
 * The supported edit path is now the dashboard at `/framework`, which writes
 * the same `portfolioSettings` row AND records an immutable history entry in
 * `portfolioFrameworkHistory`. Saves made through this script do NOT create
 * a history entry — they look like the original "pre-history seed" to the
 * runtime. Use this script only for: (a) fresh Azurite resets where no row
 * exists yet, or (b) initial provisioning of a new environment.
 *
 * Usage:
 *
 *   # First time: copy the example, edit with your real framework
 *   cp scripts/seed-analysis-framework.example.md scripts/analysis-framework.local.md
 *   $EDITOR scripts/analysis-framework.local.md
 *
 *   # Push to the local function host
 *   node scripts/seed-analysis-framework.js
 *
 *   # Or push to prod
 *   API_BASE=https://my-fn.azurewebsites.net/api FN_KEY=... node scripts/seed-analysis-framework.js
 *
 * After the first run, use the dashboard at `/framework` for all subsequent
 * edits. See `specs/004-editable-strategic-framework/quickstart.md`.
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || 'http://localhost:7071/api';
const FN_KEY = process.env.FN_KEY || null;
const KEY = 'analysis.strategicFrameworkV1';
const LOCAL_FILE = path.join(__dirname, 'analysis-framework.local.md');

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error('Local framework file not found:', LOCAL_FILE);
    console.error('Copy scripts/seed-analysis-framework.example.md to that path and edit it first.');
    process.exit(2);
  }

  const value = fs.readFileSync(LOCAL_FILE, 'utf8').trim();
  if (!value) {
    console.error('Local framework file is empty.');
    process.exit(2);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (FN_KEY) headers['x-functions-key'] = FN_KEY;

  const res = await fetch(`${BASE}/settings/${encodeURIComponent(KEY)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ value }),
  });

  if (res.status >= 200 && res.status < 300) {
    console.log(`OK: ${KEY} updated (${value.length} chars)`);
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
