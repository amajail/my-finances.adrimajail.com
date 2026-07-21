# Data Model: MCP Write Tools

**Feature**: 018-mcp-write-tools | **Date**: 2026-07-21

## 1. AuditEntry (NEW)

Immutable, append-only record of one successful write. Table: `portfolioAudit`.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `partitionKey` | string | constant `'audit'` | single partition — tiny human-driven volume |
| `rowKey` | string | `String(9_999_999_999_999 - epochMs).padStart(13,'0') + '-' + <4-char random>` | inverted timestamp → Azure's ascending rowKey scan returns newest first; suffix avoids same-ms collisions |
| `timestamp` | string (ISO 8601) | required | when the write happened (injected clock) |
| `operation` | string | `update_position \| create_position \| set_order_execution_status \| price_refresh` | |
| `targetType` | string | `position \| order \| prices` | |
| `targetId` | string | required | `"{brokerId}/{rowKey}"` for positions (e.g. `BROKER/bond__SYMBOL`), `"{analysisDate}/{index}"` for orders (e.g. `2026-07-14/02`), `"all-open"` for refresh |
| `changes` | string (JSON) | `[{ field, old, new }]`; `[]` allowed for price_refresh (summary goes in `details`) | field-level old/new values (FR-006) |
| `details` | string (JSON) or `''` | optional | operation extras, e.g. refresh `{ totalSymbols, succeeded, failed }` |
| `confirmationUsed` | boolean | default `false` | true when the over-threshold `confirm` flag was used (FR-006) |
| `source` | string | `mcp \| api \| timer`; default `api` | tool/agent identity — single-user v1, no user identity |

**Lifecycle**: append-only. No update, no delete, no retention policy (v1).

**Interface** (`src/application/interfaces/IAuditRepository.js`):

- `append(entry) → Promise<void>` — entry is the logical shape above minus keys (repo derives PK/RK).
- `listRecent(limit) → Promise<AuditEntry[]>` — newest first; `limit` clamped to 1..100, default 20.

## 2. SuggestedOrder (EXTENDED)

Entity: `src/domain/entities/SuggestedOrder.js` | Table: `portfolioOrders`
(PK = `analysisDate`, RK = zero-padded `index`).

New field:

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `executionPrice` | number \| null | optional; when present must be finite and > 0 | default `null`; existing rows (column absent) read as `null`. Stored, **not** consumed by the scorecard (outcome-P&L is future roadmap P3-2) |

Existing (unchanged, for reference): `executionStatus` ∈
`['pending','executed','partial','skipped']` (exported `EXECUTION_STATUSES`),
`executionNote` ≤ 500 chars, `executionUpdatedAt` ISO string.

**State transitions**: any status → any status (re-recording allowed; the audit
trail captures each change). `executionPrice` may accompany any status set; it
is persisted in the same `Merge` patch as the status
(`AzureAnalysisRepository.setOrderExecutionStatus`).

## 3. Change Threshold (NEW setting)

Table: `portfolioSettings` (PK `'settings'`, RK = key) — existing mechanism.

| Key | Value | Default | Validation |
|---|---|---|---|
| `mcpQuantityChangeThresholdPct` | stringified number | `50` | parsed per call; absent / non-numeric / ≤ 0 / > 100 → fall back to 50 (conservative default, guardrail never switches off) |

**Guard semantics** (`QuantityChangeGuard`, pure domain service):

- `changePct = |new − old| / old × 100` (old > 0).
- `new = 0` ⇒ always `exceeds: true` regardless of threshold (spec edge case).
- `old = 0` and `new > 0` ⇒ treated as exceeding (undefined relative change —
  conservative).
- `exceeds = changePct > thresholdPct`.

## 4. Confirmation Flag

Not persisted as an entity — a boolean `confirm` input on `update_position`
(default absent/false). Recorded on the resulting AuditEntry as
`confirmationUsed`. Required whenever the guard reports `exceeds: true`.

## 5. Unchanged entities touched by this feature

- **Position** (`src/domain/entities/Position.js`): no schema change. Writes go
  through existing `UpdatePosition` / `AddPosition` validation
  (quantity/averageCost ≥ 0, status ∈ {open, closed}, etc.).
- **Position patch fields accepted via `update_position`**: `quantity`,
  `averageCost`, `notes`, `status`, `maturityDate` (FR-002 subset). `null` /
  omitted keys are stripped before merge ⇒ stored values preserved.
