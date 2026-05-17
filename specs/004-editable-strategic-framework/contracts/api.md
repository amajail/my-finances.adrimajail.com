# API Contracts — Editable Strategic Framework

All endpoints live under the Azure Function App base (`http://localhost:7071/api` locally) and require the function key (`x-functions-key` header, `authLevel: 'function'`) for writes. Reads also require it (matching the existing dashboard endpoints — see `src/functions/settings.js`, `src/functions/positions.js`). The dashboard's `lib/api.js` already attaches the key.

Response error envelope (matches the existing `_shared.js` `mapError`):
```json
{ "error": "string", "details": "string|object" }
```

---

## 1. GET `/api/framework`

Get the currently active strategic framework.

**Request**: no body, no query params.

**Response 200**:
```json
{
  "content": "## Buckets and symbols\n\n- ...",
  "historyRowKey": "8284032399876-a3f9",
  "updatedAt": "2026-05-17T14:02:03.456Z",
  "maxBytes": 61440
}
```
- `historyRowKey` is `null` and `updatedAt` is `null` when the active framework is the pre-feature seeded row that has no associated history entry.
- `maxBytes` is the server-enforced UTF-8 byte cap (FR-017), echoed for the UI to mirror.

**Response 404**: `{ "error": "not_found", "details": "strategic framework not configured" }` — returned only if the settings row literally doesn't exist (unseeded environment). The dashboard treats this as an empty-state "configure your framework" prompt rather than an error.

---

## 2. PUT `/api/framework`

Save a new active framework. Creates a new history entry unless the content is a byte-identical no-op (FR-011).

**Request body**:
```json
{
  "content": "## Buckets and symbols\n\n- ...",
  "changeNote": "Bumped US-ETFs target to 25%"
}
```
- `content` required, non-empty after trim, UTF-8 byte length ≤ 60 KB.
- `changeNote` optional; `null`, missing, or empty-after-trim are all equivalent to "no note."

**Response 200** (new history entry created):
```json
{
  "historyRowKey": "8284032399876-a3f9",
  "timestamp": "2026-05-17T14:02:03.456Z",
  "noop": false
}
```

**Response 200** (no-op detected — content matches active):
```json
{
  "historyRowKey": "8284032399000-bb12",
  "timestamp": "2026-05-17T13:45:11.222Z",
  "noop": true
}
```
The `historyRowKey` returned is the *existing* entry already pointed at by the active framework. No new row is written.

**Response 400**:
- `{ "error": "validation", "details": "content is required" }` — empty/whitespace-only (FR-004).
- `{ "error": "validation", "details": "content exceeds maximum size of 61440 bytes (got NNNNN)" }` — over the cap (FR-017).
- `{ "error": "validation", "details": "changeNote exceeds 280 characters" }`.

**Response 401**: missing/invalid function key.

---

## 3. GET `/api/framework/history`

List framework history entries, newest first.

**Query params**:
- `limit` (optional, default 50, max 200) — number of entries to return.

**Response 200**:
```json
{
  "entries": [
    {
      "rowKey": "8284032399876-a3f9",
      "timestamp": "2026-05-17T14:02:03.456Z",
      "changeNote": "Bumped US-ETFs target to 25%",
      "source": "edit",
      "restoreOfRowKey": null,
      "contentBytes": 4123
    },
    {
      "rowKey": "8284032400123-7c14",
      "timestamp": "2026-05-16T09:11:55.789Z",
      "changeNote": "Restored from 2026-05-10T08:00:00.000Z",
      "source": "restore",
      "restoreOfRowKey": "8284033012000-d0e1",
      "contentBytes": 4011
    }
  ],
  "count": 2
}
```
- `contentBytes` is included so the history list can display a size badge without fetching full content for every row.
- `content` is **not** included in this list endpoint — clients call endpoint #4 to view full content of a specific entry.
- Empty array + `count: 0` when no UI saves exist yet (FR-013). This is the explicit empty-state contract (not a 404).

**Response 400**: `{ "error": "validation", "details": "limit must be between 1 and 200" }`.

---

## 4. GET `/api/framework/history/{rowKey}`

Get full content of one historical entry (FR-007).

**Path params**:
- `rowKey` — the entry's `id` (URL-encoded since it contains a hyphen, which is URL-safe; no encoding actually needed).

**Response 200**:
```json
{
  "rowKey": "8284032399876-a3f9",
  "timestamp": "2026-05-17T14:02:03.456Z",
  "changeNote": "Bumped US-ETFs target to 25%",
  "source": "edit",
  "restoreOfRowKey": null,
  "content": "## Buckets and symbols\n\n- ..."
}
```

**Response 404**: `{ "error": "not_found", "details": "history entry not found" }`.

---

## 5. POST `/api/framework/history/{rowKey}/restore`

Promote a historical entry's content to the new active framework. Creates a new history entry tagged `source: 'restore'` (FR-008).

**Path params**:
- `rowKey` — the entry being restored.

**Request body** (optional):
```json
{
  "changeNote": "Reverting Friday's experiment"
}
```
- `changeNote` optional. If omitted, the system generates `"Restored from <ISO timestamp of target entry>"`.

**Response 200** (new history entry created):
```json
{
  "historyRowKey": "8284031987654-1abc",
  "timestamp": "2026-05-17T14:30:00.000Z",
  "restoreOfRowKey": "8284033012000-d0e1",
  "noop": false
}
```

**Response 200** (no-op — target content equals current active):
```json
{
  "historyRowKey": "8284032399876-a3f9",
  "timestamp": "2026-05-17T14:02:03.456Z",
  "restoreOfRowKey": "8284033012000-d0e1",
  "noop": true
}
```

**Response 404**: target `rowKey` does not exist.

**Response 400**: `changeNote` over 280 chars.

---

## Existing endpoint impact

### `GET /api/analysis/weekly` (002 — list)
Each item gains an optional `frameworkHistoryRowKey` field. The dashboard renders this as a small "Framework: <timestamp> ▾" badge that links to the framework history viewer.

### `GET /api/analysis/weekly/{date}` (002 — detail)
The analysis detail response gains the same `frameworkHistoryRowKey`. The dashboard displays it prominently in the analysis header and provides a "View framework version" action that opens the framework history entry inline (or navigates to `/framework` and scrolls to that entry).

For analyses produced before this feature shipped, the field is `null` and the UI shows "(pre-history seed)".

---

## Function routes (registration)

To be registered in `src/functions/framework.js`:

| Method | Route | Function name | authLevel |
|---|---|---|---|
| GET | `framework` | `getFramework` | `function` |
| PUT | `framework` | `updateFramework` | `function` |
| GET | `framework/history` | `listFrameworkHistory` | `function` |
| GET | `framework/history/{rowKey}` | `getFrameworkHistoryEntry` | `function` |
| POST | `framework/history/{rowKey}/restore` | `restoreFrameworkVersion` | `function` |
