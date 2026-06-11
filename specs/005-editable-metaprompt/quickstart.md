# Quickstart — Editable Analysis Metaprompt

Goal: get the new `/instructions` page running locally against Azurite, seed the
merged document so it's byte-for-byte equal to the prior effective prompt, verify
save / history / restore / no-op round-trips, and confirm the next weekly analysis
uses the document verbatim and records its version.

## Prerequisites

- Repo cloned, dependencies installed (`npm install` at root and in `dashboard/`).
- Azurite running locally (`azurite --silent --location ./.azurite` or your usual setup).
- `local.settings.json` populated with `AZURE_STORAGE_CONNECTION_STRING` pointing
  at Azurite (or your dev Azure Storage).
- A current **framework** already seeded from feature 004 (an
  `analysis.strategicFrameworkV1` settings row). If not, seed a placeholder one:
  ```bash
  cp scripts/seed-analysis-framework.example.md scripts/analysis-framework.local.md
  # edit with placeholder (NON-real) content
  node scripts/seed-analysis-framework.js
  ```

## 1. Seed the merged instructions document (one-time migration)

This produces the initial instructions version byte-for-byte equal to the old
effective system prompt (FR-015, SC-004) by rendering the committed base template
⊕ the live active framework. **Privacy**: the script reads the framework from
runtime settings — nothing real is committed.

```bash
node scripts/seed-instructions-from-framework.js
# reads analysis.strategicFrameworkV1 + src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md,
# substitutes the {{strategicFramework}} slot with the trimmed framework,
# writes ONE InstructionsHistoryEntry into portfolioInstructionsHistory and
# sets analysis.instructionsV1 as the active row.
```

Idempotent: re-running with an already-seeded `analysis.instructionsV1` is a
skip-if-present no-op (does not overwrite or append a second seed — FR-020).

## 2. Start the backend

```bash
npm start    # or: func start
```

New routes should register (replacing the old `/api/framework*` ones):
```
GET    http://localhost:7071/api/instructions
PUT    http://localhost:7071/api/instructions
GET    http://localhost:7071/api/instructions/history
GET    http://localhost:7071/api/instructions/history/{rowKey}
POST   http://localhost:7071/api/instructions/history/{rowKey}/restore
```

If `local.settings.json` has `Host.LocalHttpAuth.Disabled: true`, no key is needed
locally; otherwise pass the host key as `x-functions-key`.

## 3. Start the dashboard

```bash
cd dashboard
npm run dev
```

Open http://localhost:4321 — the nav now shows **Instructions** (the former
**Framework** entry is gone, SC-006).

## 4. Verify P1: edit the complete instructions and save (FR-001/002/004)

1. Click **Instructions**. The editor pre-populates with the **whole** document —
   confirm it includes what used to be developer-only fixed text (Role, Operating
   Conventions, Guardrails, Required Output) *and* the former framework content as
   one continuous document.
2. Note the byte counter (e.g., `84,123 / 262,144 bytes`). Save is enabled.
3. Edit a line in a previously developer-only section (e.g., change a guardrail
   threshold). Optionally add a change note "smoke test".
4. Click **Save** → "last saved" timestamp updates; green confirmation.
5. Refresh — the change persists.

## 5. Verify FR-006 (256 KB size cap)

1. Paste a blob pushing the counter past 256 KB (counter turns red).
2. Save disables; message states the limit and current size.
3. Trim below the cap → save re-enables.

## 6. Verify FR-005 (empty rejection)

```bash
curl -X PUT http://localhost:7071/api/instructions \
     -H 'Content-Type: application/json' \
     -H 'x-functions-key: <key>' \
     -d '{"content":"   "}'
```
Expect HTTP 400 `{"error":"validation","details":"content is required"}`.

## 7. Verify FR-007 (no-op detection)

1. Click **Save** without changing anything.
2. Network tab: PUT responds 200 with `{ "noop": true, "historyRowKey": "<existing>" }`.
3. History section: no new row added; UI says "no changes".

## 8. Verify P2: view history (FR-008/009/010)

1. Make two more visible saves (different content each).
2. History lists entries newest-first with timestamp + change note + source tag
   (Edit / Restore).
3. Expand an older entry → full historical content shown read-only.
4. With no UI saves yet (fresh env), the list shows an explicit empty state.

## 9. Verify P3: restore (FR-011)

1. Expand the *oldest* save; click **Restore** → confirm.
2. Editor shows that older content; a new history entry appears on top tagged
   "Restored from {timestamp}", `source: 'restore'`.
3. Prior active version still present in history (append-only).
4. Restoring a version identical to current active → no new entry (no-op, FR-011).

## 10. Verify FR-012 (snapshot-at-start) + FR-013 (traceability)

1. Trigger a weekly analysis run (same pattern as 002's quickstart — timer or a
   one-off invoke of `GenerateWeeklyAnalysis`).
2. While it runs, save a NEW instructions document via the dashboard.
3. When it finishes, open it on the Analysis page. The "Instructions version: <id>"
   badge points at the version active **before** your mid-run save (snapshot-at-start).
4. Click the badge → `/instructions#<rowKey>` opens at that exact past entry,
   content matching what the analysis used.
5. Trigger another run → its badge points at the *new* version.
6. For a pre-005 analysis row (only `frameworkHistoryRowKey`, or neither field),
   the badge reads as a legacy framework reference / "(pre-history seed)" and does
   not error (FR-013).

## 11. Verify SC-004 (byte-for-byte equivalence)

1. Immediately after seeding (step 1) and **before any edit**, trigger an analysis.
2. Confirm the system prompt the AI receives equals the pre-005 effective prompt:
   diff the seeded `analysis.instructionsV1` value against
   `weekly-rebalance-v1.md` with `{{strategicFramework}}` replaced by the trimmed
   framework. They must be identical.

## 12. Verify FR-014 (no instructions configured)

1. Delete the `analysis.instructionsV1` settings row in Storage Explorer.
2. Trigger an analysis → it fails with a clear "instructions not configured"
   message rather than running with empty/partial instructions.

## 13. Manual API smoke (optional)

```bash
curl http://localhost:7071/api/instructions
curl "http://localhost:7071/api/instructions/history?limit=5"
curl http://localhost:7071/api/instructions/history/<rowKey>
curl -X POST http://localhost:7071/api/instructions/history/<rowKey>/restore \
     -H 'Content-Type: application/json' -d '{"changeNote":"manual restore"}'
```

## Troubleshooting

- **404 on GET /api/instructions**: `analysis.instructionsV1` was never seeded.
  Run `node scripts/seed-instructions-from-framework.js` (step 1).
- **History list empty after a save**: check Azurite received writes (Storage
  Explorer → `portfolioInstructionsHistory`). If the table is missing, restart the
  Functions host so `AzureTableDatabase.initialize()` re-creates it.
- **Analysis still uses the old framework-only prompt**: confirm
  `GenerateWeeklyAnalysis` now reads `analysis.instructionsV1` verbatim and no
  longer loads `prompts/${promptVersion}.md` or substitutes `{{strategicFramework}}`.
- **Seed isn't byte-for-byte**: ensure the script trims the framework before
  substitution (matching the old `_renderSystemPrompt`) and replaces **only**
  `{{strategicFramework}}`, leaving other `{{...}}` tokens as literal text.
- **Old "Framework" nav still showing**: the dashboard didn't rebuild; restart
  `npm run dev` and hard-refresh.
