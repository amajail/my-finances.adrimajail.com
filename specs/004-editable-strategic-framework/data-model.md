# Data Model — Editable Strategic Framework

## Entities

### FrameworkHistoryEntry (NEW — `src/domain/entities/FrameworkHistoryEntry.js`)

| Attribute | Type | Required | Validation | Notes |
|---|---|---|---|---|
| `id` | string | yes | non-empty; format `<descTimestamp>-<nonce>` (see Research R1) | Doubles as the storage RowKey. Sortable; descending by save time. |
| `content` | string | yes | non-empty after trim; `Buffer.byteLength(content, 'utf8') ≤ 61440` (60 KB) | The framework markdown. Stored verbatim (no transformation), whitespace preserved (FR-012). |
| `timestamp` | string (ISO 8601) | yes | parseable date in the future is rejected (defensive) | When the save was made. Set by the use-case at construction time, never by the client. |
| `changeNote` | string \| null | no | length ≤ 280 chars after trim; `null` permitted | Optional owner-supplied note. UI hint, not used by the analysis runtime. |
| `source` | enum: `'edit' \| 'restore'` | yes | must be one of the two values | `'edit'` for direct saves; `'restore'` when produced by `RestoreFrameworkVersion`. |
| `restoreOfRowKey` | string \| null | conditionally | required when `source === 'restore'`; must be `null` when `source === 'edit'` | The `id` of the history entry being restored. Enables the UI label "Restored from {timestamp}". |

**Construction rules** (enforced in the constructor; throw `DomainError`/`ValidationError` on violation):
- `content` non-empty after `.trim()` (FR-004).
- UTF-8 byte length ≤ 61440 (FR-017).
- `source` ∈ `{ 'edit', 'restore' }`; `restoreOfRowKey` presence matches `source`.
- `changeNote` if provided is trimmed; empty-after-trim is normalized to `null`.

**Invariants**:
- Immutable after construction. The entity exposes no setters.
- `id` is opaque to callers — they pass it back when fetching a specific entry or restoring.

---

### StrategicFrameworkActive (logical entity — backed by an existing `portfolioSettings` row)

Not a new domain class. The active framework is represented at the API boundary by `GetActiveFramework`'s return shape:

```jsonc
{
  "content": "string",            // current active framework markdown
  "historyRowKey": "string|null", // points at the producing FrameworkHistoryEntry, or null for pre-feature seed
  "updatedAt": "string|null"      // ISO timestamp of last save through the UI; null for pre-feature seed
}
```

---

### WeeklyAnalysis (EXISTING — extended with one new property)

The existing `WeeklyAnalysis` entity (feature 002) gains one optional property:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `frameworkHistoryRowKey` | string \| null | no (optional, additive) | The `id` of the `FrameworkHistoryEntry` whose content was used as the framework input for this run. `null` for analyses produced from pre-feature seeded content. |

No other `WeeklyAnalysis` fields change. The use-case `GenerateWeeklyAnalysis` populates this field at the moment it snapshots the framework (FR-014, FR-015).

---

## Storage layer

### Table: `portfolioFrameworkHistory` (NEW)

Owned by the new `AzureFrameworkRepository`. Created in `AzureTableDatabase.initialize()` alongside the other tables.

| Property | Storage type | Maps to entity attribute | Notes |
|---|---|---|---|
| `PartitionKey` | string | (constant `'framework'`) | Single partition; row count is small (~250/year heavy). |
| `RowKey` | string | `id` | `<descTimestamp>-<nonce>` — see Research R1. |
| `content` | string | `content` | Up to 60 KB UTF-8; well under Azure's per-property cap. |
| `timestamp` | string (ISO 8601) | `timestamp` | Stored explicitly even though the row also has Azure's automatic `Timestamp` system property — application-controlled timestamps survive system clock skew and are clearer in tooling. |
| `changeNote` | string \| absent | `changeNote` | Omitted when `null`. |
| `source` | string | `source` | `'edit'` or `'restore'`. |
| `restoreOfRowKey` | string \| absent | `restoreOfRowKey` | Present only for restore entries. |

**Indexes / scan patterns**:
- *History list* (FR-006): `listEntities({ filter: "PartitionKey eq 'framework'" })` returns rows in ascending RowKey order — which is descending by save time thanks to R1's encoding. Take the first N for newest-first.
- *Single entry* (FR-007): `getEntity('framework', rowKey)`.

**Write semantics**:
- All writes are `createEntity` (never upsert). Append-only by construction at the repository layer.

---

### Table: `portfolioSettings` (EXISTING — row amended)

Row identified by `PartitionKey = 'settings'`, `RowKey = 'analysis.strategicFrameworkV1'`.

| Property | Storage type | Status | Notes |
|---|---|---|---|
| `value` | string | EXISTING | The active framework content. Unchanged location — `GenerateWeeklyAnalysis` continues to read from here (FR-003, FR-014). |
| `historyRowKey` | string \| absent | **NEW** | The `id` of the producing `FrameworkHistoryEntry`. Absent on the pre-feature seeded row; populated on every UI save. |
| `updatedAt` | string (ISO 8601) \| absent | **NEW** | When this active value was last upserted by the UI. Absent on the pre-feature seeded row. |

**Update path**: `AzureFrameworkRepository.saveActive(...)` performs an `upsertEntity('Merge')` so existing properties (and any future ones added by other features) are preserved.

---

### Table: `portfolioAnalysis` (EXISTING — schema-on-write addition)

Each `WeeklyAnalysis` row (PartitionKey `'weekly'`, RowKey ISO date) gains:

| Property | Storage type | Status | Notes |
|---|---|---|---|
| `frameworkHistoryRowKey` | string \| absent | **NEW (optional)** | The `id` of the framework history entry whose content was used. Absent on rows written before this feature shipped. |

Azure Tables tolerates schema-on-write per row; no migration script is needed. `AzureAnalysisRepository._analysisFromEntity` must default to `null` when the property is absent so `WeeklyAnalysis` construction stays valid.

---

## State transitions

The active framework has effectively one transition: **updated**. There is no "draft", no "pending review", no "archived" state. Either the framework holds whatever the last successful save (or seed) put there, or — if the seeded row were ever deleted — the analysis runtime would fail loudly with the existing "strategic framework not configured" path in `GenerateWeeklyAnalysis.js`.

History entries are written once and never mutate. They have no state machine.

---

## Validation summary (cross-references to FRs)

| Validation | Where enforced | FR |
|---|---|---|
| Non-empty content | Domain constructor + use-case pre-check | FR-004 |
| ≤ 60 KB UTF-8 | Domain constructor + use-case pre-check | FR-017 |
| `source` ∈ `{ edit, restore }`, `restoreOfRowKey` consistency | Domain constructor | (internal) |
| `changeNote` ≤ 280 chars after trim | Domain constructor | (internal) |
| No-op detection (skip write if identical to active) | Use-case `SaveFramework.execute` | FR-011 |
| Append-only (history rows immutable) | Repository (only ever calls `createEntity`) | FR-009 |
| Active framework persisted such that `GenerateWeeklyAnalysis` sees it | Repository (`upsertEntity('Merge')` on the existing settings row) | FR-003 |
| Framework history rowKey persisted on each analysis | `GenerateWeeklyAnalysis` + `AzureAnalysisRepository.save` | FR-015 |
