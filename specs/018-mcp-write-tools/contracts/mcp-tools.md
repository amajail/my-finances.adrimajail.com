# Contract: MCP Write Tools

**Feature**: 018-mcp-write-tools | **Endpoint**: `/runtime/webhooks/mcp`
(Streamable HTTP, Azure Functions MCP extension, platform system key — v1
posture, FR-010)

All tools are registered in `src/functions/mcp.js` via `app.mcpTool`. Tool
inputs are flat properties (`{propertyName, propertyType, description,
isRequired}` — the extension's schema, not JSON Schema). Numeric inputs may
arrive as strings and are parsed in the handler. Results are JSON strings.

**Error shape (all tools)** — FR-007:

```json
{ "error": "<self-explanatory message>", "code": "ValidationError|DomainError|NotFoundError|InfrastructureError", "details": [ { "field": "...", "message": "..." } ] }
```

`details` present only when the underlying error carries field-level
validation errors.

**No delete tool exists** (FR-001). Retiring a holding = `update_position`
with `status: "closed"`.

---

## 1. `update_position` (write)

Partial update of an existing position. Delegates to `GuardedUpdatePosition`
→ `UpdatePosition` (same validation as dashboard PUT, FR-003).

| Property | Type | Required | Notes |
|---|---|---|---|
| `broker` | string | yes | broker slug (partition key) |
| `rowKey` | string | yes | `${assetType}__${symbol}`, e.g. `bond__SYMBOL` |
| `quantity` | string (number) | no | parsed float; guardrail applies |
| `averageCost` | string (number) | no | parsed float; **null/omitted preserves stored PPC** (FR-002) |
| `notes` | string | no | |
| `status` | string | no | `open \| closed` |
| `maturityDate` | string | no | ISO date |
| `confirm` | string (boolean) | no | `"true"` required when quantity change exceeds threshold (FR-004) |

**Success**: updated position JSON (`{ ...position, id }`).

**Errors**:
- Over-threshold quantity change without `confirm` → `DomainError`, message
  states change %, threshold %, and "retry with confirm: true" (FR-004/SC-004).
  Reduction to zero always requires `confirm`.
- Unknown position → `NotFoundError`.
- Domain violations (negative quantity, bad status) → `ValidationError`
  identical to the dashboard path.

**Audit**: one entry, `operation: update_position`, field-level old/new for
each changed field, `confirmationUsed` as sent, `source: mcp`.

---

## 2. `create_position` (write)

Creates a new position. Delegates to `AddPosition`.

| Property | Type | Required | Notes |
|---|---|---|---|
| `broker` | string | yes | must exist in `portfolioBrokers` |
| `assetType` | string | yes | existing vocabulary (stock/etf/bond/cedear/…) |
| `symbol` | string | yes | |
| `quantity` | string (number) | yes | |
| `averageCost` | string (number) | yes | |
| `currency` | string | yes | |
| `displayName` | string | no | |
| `maturityDate` | string | no | ISO date |
| `notes` | string | no | |

**Success**: created position JSON.

**Errors**:
- Existing open position with same broker/assetType/symbol → `DomainError`
  pointing at `"{broker}/{assetType}__{symbol}"` and suggesting
  `update_position` (FR-009).
- Unknown broker → `NotFoundError`.
- Missing/invalid fields → `ValidationError` with field list.

**Audit**: `operation: create_position`, changes = each provided field with
`old: null`.

---

## 3. `set_order_execution_status` (write)

Records execution outcome on a suggested order. Delegates to
`SetOrderExecutionStatus`.

| Property | Type | Required | Notes |
|---|---|---|---|
| `date` | string | yes | analysis date `YYYY-MM-DD` (partition) |
| `index` | string (integer) | yes | 0-based order index |
| `status` | string | yes | `pending \| executed \| partial \| skipped` (FR-005) |
| `executionPrice` | string (number) | no | finite > 0; stored for future outcome-P&L, not scored yet |
| `note` | string | no | ≤ 500 chars |

**Success**: `{ date, index, status, note, executionPrice, updatedAt }`.

**Errors**: invalid status → `ValidationError` listing allowed values; unknown
date/index → `NotFoundError`; bad price → `ValidationError`.

**Audit**: `operation: set_order_execution_status`, target `"{date}/{index}"`,
old/new for status/note/price.

---

## 4. `trigger_price_refresh` (write)

Runs the existing `RefreshPrices` use case (same behavior as timer/HTTP).

Inputs: none.

**Success**: `{ totalSymbols, succeeded, failed, durationMs }` (FR-008).
May be slow (as long as the scheduled refresh); may run redundantly alongside
the timer — single-entity writes, never half-updated.

**Audit**: `operation: price_refresh`, target `all-open`, `changes: []`,
`details: { totalSymbols, succeeded, failed }`.

---

## 5. `list_audit_entries` (read — FR-006 queryability)

| Property | Type | Required | Notes |
|---|---|---|---|
| `limit` | string (integer) | no | default 20, clamped 1..100 |

**Success**: array (newest first) of
`{ timestamp, operation, targetType, targetId, changes: [{field, old, new}], details, confirmationUsed, source }`.

---

## Side contract: HTTP PATCH parity

`PATCH /api/analysis/weekly/{date}/orders/{index}` (existing, feature 007)
additionally accepts optional `executionPrice` in the body with the same
validation — keeping dashboard/API parity with the MCP tool (FR-003).
