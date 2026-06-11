# Data Model — Editable Analysis Metaprompt

Extends and supersedes feature 004's model. The framework concept is renamed to
**Instructions** and now holds the *complete* AI system prompt, used verbatim.

## Entities

### InstructionsHistoryEntry (NEW — `src/domain/entities/InstructionsHistoryEntry.js`)

Renamed/repurposed from `FrameworkHistoryEntry`. Same shape; `content` now holds
the **whole** instructions document and the size cap is larger.

| Attribute | Type | Required | Validation | Notes |
|---|---|---|---|---|
| `id` | string | yes | non-empty; format `<descTimestamp>-<nonce>` (004 R1 encoding, sortable descending by save time) | Doubles as storage RowKey. |
| `content` | string | yes | non-empty after trim; `Buffer.byteLength(content, 'utf8') ≤ 262144` (256 KB) | The full instructions/system-prompt document. Stored verbatim, whitespace preserved (FR-002, FR-015). |
| `timestamp` | string (ISO 8601) | yes | parseable; future dates rejected (defensive) | Set by the use-case at construction, never by the client. |
| `changeNote` | string \| null | no | length ≤ 280 after trim; empty-after-trim normalized to `null` | Optional owner note (FR-009). |
| `source` | enum `'edit' \| 'restore'` | yes | one of the two values | `'edit'` for direct saves; `'restore'` from `RestoreInstructionsVersion`. |
| `restoreOfRowKey` | string \| null | conditional | required when `source === 'restore'`; `null` when `source === 'edit'` | The `id` of the entry being restored (FR-009, FR-011). |

**Construction rules** (constructor throws `DomainError`/`ValidationError`):
- `content` non-empty after `.trim()` (FR-005).
- UTF-8 byte length ≤ 262144 (FR-006).
- `source` ∈ `{ edit, restore }`; `restoreOfRowKey` presence matches `source`.
- `changeNote` trimmed; empty → `null`.
- `static MAX_BYTES = 262144`.
- `static buildRowKey(epochMs)` → `(9999999999999 - epochMs)` left-padded to 13
  digits + `'-'` + 4-hex nonce (carried over from 004).

**Invariants**: immutable after construction (frozen); `id` opaque to callers.

---

### InstructionsActive (logical entity — backed by a `portfolioSettings` row)

Not a new domain class. Represented at the API boundary by `GetActiveInstructions`'s
return shape:

```jsonc
{
  "content": "string",            // current active instructions document (verbatim system prompt)
  "historyRowKey": "string|null", // producing InstructionsHistoryEntry id, or null for the seed row if seeded without history
  "updatedAt": "string|null",     // ISO timestamp of last UI save; null for an unedited seed
  "maxBytes": 262144              // server-enforced cap, echoed for the UI
}
```

Per FR-020 exactly **one** initial version is seeded and the active row points at
it, so in the normal seeded state `historyRowKey` is non-null.

---

### WeeklyAnalysis (EXISTING — extended with one new property)

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `instructionsHistoryRowKey` | string \| null | no (optional, additive) | The `id` of the `InstructionsHistoryEntry` whose content was used as the system prompt for this run (snapshot-at-start, FR-012). `null` for runs before this feature. |
| `frameworkHistoryRowKey` | string \| null | no (legacy, additive) | Retained from 004 for pre-005 analysis rows. New runs leave it `null` and populate `instructionsHistoryRowKey` instead (R5). |

`GenerateWeeklyAnalysis` populates `instructionsHistoryRowKey` at the moment it
snapshots the active instructions document (FR-012). No other fields change.

---

## Storage layer

### Table: `portfolioInstructionsHistory` (NEW)

Owned by `AzureInstructionsRepository`. Created in `AzureTableDatabase.initialize()`
alongside the other tables. Structurally identical to 004's
`portfolioFrameworkHistory`; new table name → fresh history per FR-020.

| Property | Storage type | Maps to | Notes |
|---|---|---|---|
| `PartitionKey` | string | constant `'instructions'` | Single partition; small row count. |
| `RowKey` | string | `id` | `<descTimestamp>-<nonce>`. |
| `content` (+ `content1`, `content2`, …, `contentChunks`) | string(s) + int | `content` | Up to 256 KB UTF-8. **Chunked** across ≤32000-char properties because Azure caps a single string property at 64 KB; reassembled on read. See research R4. |
| `timestamp` | string (ISO 8601) | `timestamp` | Application-controlled, clock-skew-safe. |
| `changeNote` | string \| absent | `changeNote` | Omitted when `null`. |
| `source` | string | `source` | `'edit'` or `'restore'`. |
| `restoreOfRowKey` | string \| absent | `restoreOfRowKey` | Present only for restore entries. |

**Scan patterns**:
- *History list* (FR-010): `listEntities({ filter: "PartitionKey eq 'instructions'" })`
  returns ascending RowKey = descending save time; take first N for newest-first.
- *Single entry* (FR-010): `getEntity('instructions', rowKey)`.

**Write semantics**: all writes are `createEntity` (never upsert). Append-only by
construction (FR-008).

---

### Table: `portfolioSettings` (EXISTING — new row)

New row: `PartitionKey = 'settings'`, `RowKey = 'analysis.instructionsV1'`.

| Property | Storage type | Status | Notes |
|---|---|---|---|
| `value` (+ `value1`, …, `valueChunks`) | string(s) + int | NEW | The active instructions document, **chunked** like `content` above (64 KB per-property cap). `GenerateWeeklyAnalysis` reads the reassembled value via the repository and uses it verbatim as the system prompt (FR-004). |
| `historyRowKey` | string \| absent | NEW | `id` of the producing `InstructionsHistoryEntry`. |
| `updatedAt` | string (ISO 8601) \| absent | NEW | When last upserted by the UI. |

**Update path**: `AzureInstructionsRepository.saveActive(...)` does
`upsertEntity('Merge')` so unrelated properties are preserved.

**Retired**: `analysis.promptVersion` (FR-019) — left in storage, no longer read.
`analysis.strategicFrameworkV1` and the `portfolioFrameworkHistory` table from 004
are left in place but orphaned (R1); the analysis runtime no longer reads them.

---

### Table: `portfolioAnalysis` (EXISTING — schema-on-write addition)

Each `WeeklyAnalysis` row (PartitionKey `'weekly'`, RowKey ISO date) gains:

| Property | Storage type | Status | Notes |
|---|---|---|---|
| `instructionsHistoryRowKey` | string \| absent | NEW (optional) | `id` of the instructions version used. Absent on rows written before this feature. |

`AzureAnalysisRepository._analysisFromEntity` defaults the property to `null` when
absent so `WeeklyAnalysis` construction stays valid (FR-013). No migration script.
The legacy `frameworkHistoryRowKey` property keeps being read for old rows.

---

## State transitions

The active instructions document has one transition: **updated** (via edit or
restore). No draft/pending/archived states. If the active row were deleted, the
analysis runtime fails loudly via the FR-014 "instructions not configured" path.

History entries are written once and never mutate — no state machine.

---

## Validation summary (cross-references to FRs)

| Validation | Where enforced | FR |
|---|---|---|
| Non-empty content | Domain constructor + use-case pre-check | FR-005 |
| ≤ 256 KB UTF-8 | Domain constructor + use-case pre-check | FR-006 |
| `source` ∈ `{ edit, restore }`, `restoreOfRowKey` consistency | Domain constructor | FR-009 |
| `changeNote` ≤ 280 chars after trim | Domain constructor | FR-009 |
| No-op detection (skip write if identical to active) | `SaveInstructions.execute` | FR-007 |
| Append-only (history rows immutable) | Repository (only `createEntity`) | FR-008 |
| Active document persisted where `GenerateWeeklyAnalysis` reads it | Repository (`upsertEntity('Merge')`) | FR-004 |
| Verbatim use as system prompt (no token substitution) | `GenerateWeeklyAnalysis` (drop `.replace`) | FR-003, FR-004 |
| Instructions version rowKey stamped on each analysis | `GenerateWeeklyAnalysis` + `AzureAnalysisRepository.save` | FR-012 |
| Fail clearly when no active document configured | `GenerateWeeklyAnalysis` | FR-014 |
| Seed byte-for-byte equal to prior effective prompt | `scripts/seed-instructions-from-framework.js` | FR-015, SC-004 |
| Exactly one seeded initial version; no 004 history carryover | Seed writes one entry into the new table | FR-020 |
| Operator-only access | HTTP `authLevel: 'function'` | FR-016 |
