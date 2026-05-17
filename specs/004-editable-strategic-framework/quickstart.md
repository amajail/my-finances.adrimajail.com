# Quickstart — Editable Strategic Framework

Goal: get the new `/framework` page running locally against Azurite, manually verify save / history / restore round-trips, and confirm the next weekly analysis picks up the new content.

## Prerequisites

- Repo cloned, dependencies installed (`npm install` at root, `npm install` in `dashboard/`).
- Azurite running locally (`azurite --silent --location ./.azurite` or your usual setup).
- `local.settings.json` populated with `AZURE_STORAGE_CONNECTION_STRING` pointing at Azurite (or your dev Azure Storage).
- A current framework already seeded — if not, run the existing one-time seed:
  ```bash
  cp scripts/seed-analysis-framework.example.md scripts/analysis-framework.local.md
  # edit with placeholder content
  node scripts/seed-analysis-framework.js
  ```
  After this feature ships you'll never need the seed script again; the UI replaces it.

## 1. Start the backend

```bash
npm start    # or: func start
```

You should see the new routes registered alongside existing ones:
```
GET    http://localhost:7071/api/framework
PUT    http://localhost:7071/api/framework
GET    http://localhost:7071/api/framework/history
GET    http://localhost:7071/api/framework/history/{rowKey}
POST   http://localhost:7071/api/framework/history/{rowKey}/restore
```

If your `local.settings.json` has `Host.LocalHttpAuth.Disabled: true`, no function key is needed locally; otherwise grab it from the host startup logs and pass it as `x-functions-key`.

## 2. Start the dashboard

```bash
cd dashboard
npm run dev
```

Open http://localhost:4321 — the nav should now show a top-level **Framework** entry sibling to Portfolio / Brokers / Positions / Analysis / Settings.

## 3. Verify P1: edit and save

1. Click **Framework** in the nav. The editor pre-populates with the currently active framework content.
2. Note the byte counter under the editor (e.g., `4,123 / 61,440 bytes`). Save button is enabled.
3. Make a small visible change (e.g., add `<!-- test edit YYYY-MM-DD -->` at the top).
4. Optionally type a change note: "smoke test".
5. Click **Save**. The "last saved" timestamp updates; a green confirmation appears.
6. Refresh the page. The change is still there.

## 4. Verify FR-017 (size cap)

1. Paste a >60 KB blob (e.g., `lorem ipsum` repeated until the counter goes red).
2. Save button disables; counter shows red with "exceeds maximum size."
3. Trim back below the cap — save re-enables.

## 5. Verify FR-004 (empty rejection)

1. Clear the editor entirely.
2. Save button disables (or attempt a manual PUT via curl):
   ```bash
   curl -X PUT http://localhost:7071/api/framework \
        -H 'Content-Type: application/json' \
        -H 'x-functions-key: <key>' \
        -d '{"content":"   "}'
   ```
   Expect HTTP 400 with `{"error":"validation","details":"content is required"}`.

## 6. Verify FR-011 (no-op detection)

1. Click **Save** without changing anything.
2. Network tab: the PUT responds 200 with `{ "noop": true, "historyRowKey": "<existing>" }`.
3. Scroll to the **History** section: no new row was added.

## 7. Verify P2: view history

1. Make two more visible saves (different content each time).
2. The History section now lists three entries newest-first, each with timestamp + change note + source tag (Edit / Restore).
3. Click an older entry — it expands inline showing the full historical content read-only.

## 8. Verify P3: restore

1. From history, expand the *oldest* of your three saves.
2. Click **Restore** → confirm in the modal.
3. The editor now shows that older content. A new history entry appears at the top tagged "Restored from {timestamp}", `source: 'restore'`.
4. Verify the prior active version is still visible in history (append-only).

## 9. Verify FR-014 (snapshot-at-start) + FR-015 (analysis traceability)

This requires triggering a weekly analysis run manually:

1. In a separate terminal, trigger the analysis timer via the Azure Functions host or directly invoke the use-case via a one-off script. (Same pattern as 002's quickstart.)
2. While the analysis is running, save a NEW framework via the dashboard.
3. When the analysis finishes, open it on the Analysis page. The "Framework version: <timestamp>" badge should point at the framework that was active **before** your mid-run save (snapshot-at-start).
4. Click the badge — the framework history viewer opens at that exact past entry, content matching what the analysis used.
5. Trigger another analysis. This one's badge points at the *new* framework.

For pre-existing analyses (rows written before this feature shipped), the badge reads "(pre-history seed)" and clicking it shows the seeded content with no history-entry metadata.

## 10. Manual API smoke (optional)

```bash
# Get active
curl http://localhost:7071/api/framework

# List history (limit 5)
curl "http://localhost:7071/api/framework/history?limit=5"

# Get one history entry
curl http://localhost:7071/api/framework/history/<rowKey>

# Restore
curl -X POST http://localhost:7071/api/framework/history/<rowKey>/restore \
     -H 'Content-Type: application/json' \
     -d '{"changeNote":"manual restore"}'
```

## Troubleshooting

- **404 on GET /api/framework**: settings row was never seeded. Run `node scripts/seed-analysis-framework.js` once with placeholder content. After the first UI save, the row is fully UI-managed.
- **History list is empty even after a save**: check Azurite is actually receiving writes (Storage Explorer → `portfolioFrameworkHistory`). If the table doesn't exist, restart the Functions host so `AzureTableDatabase.initialize()` re-runs.
- **Save returns 200 but the editor doesn't show the new "last saved" timestamp**: the dashboard didn't re-fetch. Hard refresh (Cmd-Shift-R).
- **Analysis runs but no framework badge appears in the UI**: existing pre-feature rows lack `frameworkHistoryRowKey`. Trigger a new run; it should populate the field.
