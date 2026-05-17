#!/usr/bin/env node
/**
 * Seed the four `portfolioSettings` rows that the weekly rebalance analysis
 * use-case (feature 002) reads at the start of every run.
 *
 * Uses the same HTTP-API pattern as `scripts/seed-brokers.js`. Idempotent:
 * an existing key is left untouched (the script doesn't try to overwrite
 * the user's chosen values).
 *
 *   node scripts/seed-analysis-settings.js
 *
 * For prod, set API_BASE to the prod Function App base URL and provide the
 * function key as the `x-functions-key` header via FN_KEY:
 *
 *   API_BASE=https://my-fn.azurewebsites.net/api \
 *   FN_KEY=...                                  \
 *   node scripts/seed-analysis-settings.js
 *
 * Alternative for prod: set the four rows manually via Azure Storage
 * Explorer / the portal. Either works — the use-case only reads.
 */

const BASE = process.env.API_BASE || 'http://localhost:7071/api';
const FN_KEY = process.env.FN_KEY || null;

const SETTINGS = [
  { key: 'analysis.model', value: 'claude-opus-4-7' },
  { key: 'analysis.promptVersion', value: 'weekly-rebalance-v1' },
  { key: 'analysis.maxInputTokens', value: '80000' },
  { key: 'analysis.maxOutputTokens', value: '8000' },
];

async function getOne(key) {
  const url = `${BASE}/settings/${encodeURIComponent(key)}${FN_KEY ? `?code=${FN_KEY}` : ''}`;
  const res = await fetch(url);
  return { status: res.status };
}

async function putOne(key, value) {
  const headers = { 'Content-Type': 'application/json' };
  if (FN_KEY) headers['x-functions-key'] = FN_KEY;
  const url = `${BASE}/settings/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ value }),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const { key, value } of SETTINGS) {
    try {
      const existing = await getOne(key);
      if (existing.status === 200) {
        console.log(`  skip   ${key} (already set)`);
        skipped += 1;
        continue;
      }
      // Anything other than 200 (typically 404) → write the default.
      const result = await putOne(key, value);
      if (result.status >= 200 && result.status < 300) {
        console.log(`  set    ${key} = ${value}`);
        created += 1;
      } else {
        console.error(`  fail   ${key} → ${result.status} ${result.body}`);
        failed += 1;
      }
    } catch (err) {
      console.error(`  error  ${key}: ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
