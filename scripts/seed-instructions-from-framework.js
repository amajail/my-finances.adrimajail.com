#!/usr/bin/env node
/**
 * Seed the active instructions document (feature 005-editable-metaprompt) by
 * rendering the committed base prompt template ⊕ the live strategic framework,
 * then writing it as exactly ONE instructions version.
 *
 * This reproduces the pre-005 effective system prompt byte-for-byte (FR-015,
 * SC-004): the old runtime did
 *     template.replace(/{{strategicFramework}}/g, framework.trim())
 * and that exact transformation is repeated here. Only the
 * `{{strategicFramework}}` token is replaced; every other `{{...}}` token in
 * the template stays literal (it documents inputs delivered separately in the
 * user message, which the old runtime never substituted into the system prompt).
 *
 * ⚠️ ONE-TIME MIGRATION. Idempotent: if an active instructions document already
 * exists, this exits without writing a second seed (FR-020). After seeding, use
 * the dashboard at `/instructions` for all subsequent edits.
 *
 * Privacy (Constitution I): the merged document contains the owner's real
 * framework. It is generated at runtime from the live settings row and PUT to
 * the API — nothing real is written to git.
 *
 * Usage:
 *   node scripts/seed-instructions-from-framework.js
 *   API_BASE=https://my-fn.azurewebsites.net/api FN_KEY=... node scripts/seed-instructions-from-framework.js
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || 'http://localhost:7071/api';
const FN_KEY = process.env.FN_KEY || null;
const FRAMEWORK_KEY = 'analysis.strategicFrameworkV1';
const TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  'src',
  'application',
  'use-cases',
  'analysis',
  'prompts',
  'weekly-rebalance-v1.md'
);
// Fresh/unseeded-environment fallback: a generic, committable framework so a
// clean deploy still produces a valid one-version seed rather than emitting a
// literal "{{strategicFramework}}" line (research R2; relates to FR-014).
const EXAMPLE_FRAMEWORK_PATH = path.join(__dirname, 'seed-analysis-framework.example.md');

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (FN_KEY) h['x-functions-key'] = FN_KEY;
  return h;
}

async function getActiveInstructions() {
  const res = await fetch(`${BASE}/instructions`, { headers: headers() });
  if (res.status === 200) return res.json();
  if (res.status === 404) return null;
  throw new Error(`GET /instructions failed: HTTP ${res.status} — ${await res.text()}`);
}

async function getFramework() {
  const res = await fetch(`${BASE}/settings/${encodeURIComponent(FRAMEWORK_KEY)}`, { headers: headers() });
  if (res.status === 200) {
    const body = await res.json();
    return typeof body?.value === 'string' ? body.value : '';
  }
  if (res.status === 404) return '';
  throw new Error(`GET /settings/${FRAMEWORK_KEY} failed: HTTP ${res.status} — ${await res.text()}`);
}

async function main() {
  // 1. Idempotency guard (FR-020): never seed twice.
  const existing = await getActiveInstructions();
  if (existing && typeof existing.content === 'string' && existing.content.trim()) {
    console.log('Active instructions already configured — skipping seed (idempotent).');
    return;
  }

  // 2. Base template (committed, generic).
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // 3. Live framework (or generic example for a fresh environment).
  let framework = await getFramework();
  if (!framework.trim()) {
    if (fs.existsSync(EXAMPLE_FRAMEWORK_PATH)) {
      framework = fs.readFileSync(EXAMPLE_FRAMEWORK_PATH, 'utf8');
      console.warn(`No "${FRAMEWORK_KEY}" found — seeding with the generic example framework.`);
    } else {
      console.error(`No "${FRAMEWORK_KEY}" set and no example framework file present. Aborting.`);
      process.exit(2);
    }
  }

  // 4. Reproduce the old runtime's exact substitution (trimmed framework, only
  //    the {{strategicFramework}} token) for byte-for-byte equivalence.
  const content = template.replace(/\{\{strategicFramework\}\}/g, framework.trim());

  // 5. Write exactly one instructions version via the API (creates history + active row).
  const res = await fetch(`${BASE}/instructions`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      content,
      changeNote: 'Seeded merged metaprompt (feature 005 migration)',
    }),
  });

  if (res.status >= 200 && res.status < 300) {
    const body = await res.json().catch(() => ({}));
    console.log(`OK: seeded instructions (${Buffer.byteLength(content, 'utf8')} bytes), historyRowKey=${body.historyRowKey || '?'}`);
    return;
  }
  console.error(`FAIL: PUT /instructions HTTP ${res.status} — ${await res.text()}`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
