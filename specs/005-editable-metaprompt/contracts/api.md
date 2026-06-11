# API Contracts — Editable Analysis Metaprompt

Supersedes feature 004's `/api/framework*` endpoints by renaming them to
`/api/instructions*` with identical shapes plus the larger size cap. All
endpoints live under the Function App base (`http://localhost:7071/api` locally),
require the function key (`x-functions-key`, `authLevel: 'function'`) for reads
and writes (FR-016), and use the shared error envelope:

```json
{ "error": "string", "details": "string|object" }
```

The dashboard's `lib/api.js` already attaches the key.

**Migration note**: `/api/framework*` routes are removed (SC-006). The dashboard
nav, page, and API client switch to `/api/instructions*` in the same change.

---

## 1. GET `/api/instructions`

Get the currently active instructions document.

**Request**: no body, no query params.

**Response 200**:
```json
{
  "content": "# Weekly Portfolio Rebalance Analysis ...\n\n## Strategic Framework\n...",
  "historyRowKey": "8284032399876-a3f9",
  "updatedAt": "2026-06-11T14:02:03.456Z",
  "maxBytes": 262144
}
```
- `historyRowKey`/`updatedAt` are `null` only if the active row was seeded without
  an associated history entry (not the normal seeded state — FR-020 seeds one
  version).
- `maxBytes` is the server-enforced 256 KB UTF-8 cap (FR-006), echoed for the UI.

**Response 404**: `{ "error": "not_found", "details": "instructions not configured" }`
— only if the settings row literally doesn't exist (unseeded environment). The
dashboard treats this as an empty-state "configure your instructions" prompt
(relates to FR-014).

---

## 2. PUT `/api/instructions`

Save a new active instructions document. Creates a new history entry unless the
content is a byte-identical no-op (FR-007).

**Request body**:
```json
{
  "content": "# Weekly Portfolio Rebalance Analysis ...",
  "changeNote": "Tightened the guardrail on single-week rotation"
}
```
- `content` required, non-empty after trim, UTF-8 byte length ≤ 262144 (FR-005, FR-006).
- `changeNote` optional; `null`, missing, or empty-after-trim all mean "no note".

**Response 200** (new history entry created):
```json
{ "historyRowKey": "8284032399876-a3f9", "timestamp": "2026-06-11T14:02:03.456Z", "noop": false }
```

**Response 200** (no-op — content matches active, FR-007):
```json
{ "historyRowKey": "8284032399000-bb12", "timestamp": "2026-06-11T13:45:11.222Z", "noop": true }
```
`historyRowKey` is the *existing* entry the active document already points at. No
new row is written. The dashboard tells the owner there were no changes.

**Response 400**:
- `{ "error": "validation", "details": "content is required" }` — empty/whitespace-only (FR-005).
- `{ "error": "validation", "details": "content exceeds maximum size of 262144 bytes (got NNNNN)" }` — over cap (FR-006).
- `{ "error": "validation", "details": "changeNote exceeds 280 characters" }`.

**Response 401**: missing/invalid function key.

---

## 3. GET `/api/instructions/history`

List instructions history entries, newest first (FR-010).

**Query params**: `limit` (optional, default 50, max 200).

**Response 200**:
```json
{
  "entries": [
    {
      "rowKey": "8284032399876-a3f9",
      "timestamp": "2026-06-11T14:02:03.456Z",
      "changeNote": "Tightened the guardrail on single-week rotation",
      "source": "edit",
      "restoreOfRowKey": null,
      "contentBytes": 84123
    },
    {
      "rowKey": "8284032400123-7c14",
      "timestamp": "2026-06-10T09:11:55.789Z",
      "changeNote": "Restored from 2026-06-09T08:00:00.000Z",
      "source": "restore",
      "restoreOfRowKey": "8284033012000-d0e1",
      "contentBytes": 84011
    }
  ],
  "count": 2
}
```
- `contentBytes` lets the list show a size badge without fetching full content.
- `content` is **not** included here — use endpoint #4 for full content.
- Empty array + `count: 0` is the explicit empty-state contract (FR-010), not a 404.

**Response 400**: `{ "error": "validation", "details": "limit must be between 1 and 200" }`.

---

## 4. GET `/api/instructions/history/{rowKey}`

Get full content of one historical entry (FR-010).

**Path params**: `rowKey` — the entry's `id`.

**Response 200**:
```json
{
  "rowKey": "8284032399876-a3f9",
  "timestamp": "2026-06-11T14:02:03.456Z",
  "changeNote": "Tightened the guardrail on single-week rotation",
  "source": "edit",
  "restoreOfRowKey": null,
  "content": "# Weekly Portfolio Rebalance Analysis ..."
}
```

**Response 404**: `{ "error": "not_found", "details": "history entry not found" }`.

---

## 5. POST `/api/instructions/history/{rowKey}/restore`

Promote a historical entry's content to the new active document. Creates a new
history entry tagged `source: 'restore'` (FR-011).

**Path params**: `rowKey` — the entry being restored.

**Request body** (optional):
```json
{ "changeNote": "Reverting Friday's experiment" }
```
- `changeNote` optional. If omitted, the system generates
  `"Restored from <ISO timestamp of target entry>"`.

**Response 200** (new history entry created):
```json
{ "historyRowKey": "8284031987654-1abc", "timestamp": "2026-06-11T14:30:00.000Z", "restoreOfRowKey": "8284033012000-d0e1", "noop": false }
```

**Response 200** (no-op — target content equals current active, FR-011):
```json
{ "historyRowKey": "8284032399876-a3f9", "timestamp": "2026-06-11T14:02:03.456Z", "restoreOfRowKey": "8284033012000-d0e1", "noop": true }
```

**Response 404**: target `rowKey` does not exist.

**Response 400**: `changeNote` over 280 chars.

---

## Existing endpoint impact

### `GET /api/analysis/weekly` (002 — list)
Each item gains an optional `instructionsHistoryRowKey`. The dashboard renders it
as a small "Instructions: <id> ▾" badge linking to the instructions history
viewer. The legacy `frameworkHistoryRowKey` is still returned for pre-005 rows.

### `GET /api/analysis/weekly/{date}` (002 — detail)
The detail response gains `instructionsHistoryRowKey`. The dashboard shows it in
the analysis header with a "View instructions version" action that opens
`/instructions#<rowKey>`. For analyses with neither field (pre-history), the UI
shows "(pre-history seed)"; for pre-005 analyses that have only
`frameworkHistoryRowKey`, the UI labels it as a legacy framework reference (FR-013).

---

## Function routes (registration)

To be registered in `src/functions/instructions.js` (replacing `framework.js`):

| Method | Route | Function name | authLevel |
|---|---|---|---|
| GET | `instructions` | `getInstructions` | `function` |
| PUT | `instructions` | `updateInstructions` | `function` |
| GET | `instructions/history` | `listInstructionsHistory` | `function` |
| GET | `instructions/history/{rowKey}` | `getInstructionsHistoryEntry` | `function` |
| POST | `instructions/history/{rowKey}/restore` | `restoreInstructionsVersion` | `function` |
