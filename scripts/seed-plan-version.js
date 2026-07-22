#!/usr/bin/env node
/**
 * Seed one strategic plan version (TargetAllocations + DeployRules + version
 * header) into Azure Table Storage, per docs/metaprompt-rebalance-plan.md
 * §2/§3/§7. Models: src/domain/plan/plan-entities.d.ts.
 *
 * Tables (created if missing):
 *   portfolioTargetAllocations  pk = version id, rk = {bucket}_{assetClass}
 *   portfolioDeployRules        pk = version id, rk = {bucket}_{NN}_{symbol}
 *   portfolioPlanVersions       pk = "versions", rk = version id
 *
 * Semantics: UPSERT within the version's partition (re-running the same
 * version overwrites it — versions are immutable-by-convention once superseded,
 * editable while being drafted). Any OTHER version marked active is deactivated
 * (isActive=false, effectiveTo = new version's effectiveFrom): only one active
 * version at a time (§7).
 *
 * The real document lives in scripts/plan-version.local.json (gitignored —
 * Privacy First); copy scripts/plan-version.example.json to start.
 *
 * Connection string: AZURE_STORAGE_CONNECTION_STRING env var, else
 * local.settings.json. Deliberately does NOT read .env (it points other tooling
 * at a different storage account).
 *
 * Usage:
 *   node scripts/seed-plan-version.js            # seed + activate
 *   node scripts/seed-plan-version.js --dry-run  # print rows, write nothing
 */

const fs = require('fs');
const path = require('path');
const { TableClient } = require('@azure/data-tables');
const { buildPlanVersionRows } = require('../src/domain/plan/planVersion');

const LOCAL_FILE = path.join(__dirname, 'plan-version.local.json');
const DRY_RUN = process.argv.includes('--dry-run');

function connectionString() {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return process.env.AZURE_STORAGE_CONNECTION_STRING;
  }
  const localSettingsPath = path.join(__dirname, '..', 'local.settings.json');
  if (fs.existsSync(localSettingsPath)) {
    const settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
    const conn = settings && settings.Values && settings.Values.AZURE_STORAGE_CONNECTION_STRING;
    if (conn) return conn;
  }
  console.error('No AZURE_STORAGE_CONNECTION_STRING (env or local.settings.json).');
  process.exit(2);
}

async function ensureTable(client) {
  try {
    await client.createTable();
  } catch (err) {
    if (err.statusCode !== 409) throw err; // 409 = already exists
  }
}

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error('Plan document not found:', LOCAL_FILE);
    console.error('Copy scripts/plan-version.example.json to that path and edit it first.');
    process.exit(2);
  }
  const doc = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));

  // Validates (sum-to-one, unique priorities, key formats) and expands; throws
  // with the full violation list on invalid input.
  const { planVersion, targetAllocations, deployRules } = buildPlanVersionRows(doc);

  console.log(`Plan version ${planVersion.rowKey} — ${targetAllocations.length} targets, ${deployRules.length} deploy rules, effective ${planVersion.effectiveFrom}`);
  if (DRY_RUN) {
    console.log(JSON.stringify({ planVersion, targetAllocations, deployRules }, null, 2));
    console.log('DRY RUN — nothing written.');
    return;
  }

  const conn = connectionString();
  const account = /AccountName=([^;]+)/.exec(conn);
  console.log('Storage account:', account ? account[1] : '(unknown)');

  const versionsClient = TableClient.fromConnectionString(conn, 'portfolioPlanVersions');
  const targetsClient = TableClient.fromConnectionString(conn, 'portfolioTargetAllocations');
  const rulesClient = TableClient.fromConnectionString(conn, 'portfolioDeployRules');
  await Promise.all([versionsClient, targetsClient, rulesClient].map(ensureTable));

  // 1. Deactivate any other active version (§7: exactly one active).
  for await (const v of versionsClient.listEntities({ queryOptions: { filter: `PartitionKey eq 'versions'` } })) {
    if (v.rowKey !== planVersion.rowKey && v.isActive === true) {
      await versionsClient.updateEntity(
        { partitionKey: 'versions', rowKey: v.rowKey, isActive: false, effectiveTo: planVersion.effectiveFrom },
        'Merge'
      );
      console.log(`Deactivated prior version ${v.rowKey} (effectiveTo=${planVersion.effectiveFrom}).`);
    }
  }

  // 2. Upsert the version's rows.
  for (const t of targetAllocations) await targetsClient.upsertEntity(t, 'Replace');
  for (const r of deployRules) await rulesClient.upsertEntity(r, 'Replace');
  await versionsClient.upsertEntity(planVersion, 'Replace');

  console.log(`OK: ${planVersion.rowKey} seeded and active.`);
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
