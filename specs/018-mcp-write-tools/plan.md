# Implementation Plan: MCP Write Tools for Conversational Portfolio Maintenance

**Branch**: `018-mcp-write-tools` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-mcp-write-tools/spec.md`

## Summary

Extend the existing Azure Functions MCP server (`src/functions/mcp.js`, today
read-only) with four write tools — `update_position`, `create_position`,
`set_order_execution_status` (with optional execution price),
`trigger_price_refresh` — plus a read tool `list_audit_entries`. Every write
delegates to the existing use-case layer through the DI container, so domain
validation cannot be bypassed (FR-003). Guardrails are first-class: no delete
tool exists; over-threshold quantity changes require an explicit `confirm` flag
(threshold from `portfolioSettings`, conservative 50% default); explicit `null`
fields preserve stored values; and every successful write appends a field-level
old/new entry to a new append-only `portfolioAudit` table via an optional
`auditRepository` dependency wired into the shared use cases (so dashboard-path
writes are audited too, per the concurrent-writes edge case). No new npm
dependencies, no new auth mechanism (platform system key posture per FR-010).

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4, `@azure/functions ^4.16.2`)

**Primary Dependencies**: `@azure/data-tables` (existing), Azure Functions MCP
extension (existing, configured in `host.json`; tools registered via
`app.mcpTool`). **No new dependencies.**

**Storage**: Azure Table Storage. One **new table**: `portfolioAudit`
(append-only; PK `'audit'`, RK inverted-timestamp for newest-first listing).
One **new column**: `executionPrice` on `portfolioOrders` rows. No migration —
both are additive; existing rows read as `executionPrice: null`.

**Testing**: Jest 30, existing layout `tests/unit/{domain,application,infrastructure}`
with plain-object mock repositories.

**Target Platform**: Azure Functions (Linux consumption), local dev via Azurite +
`func start` on `:7071`; MCP endpoint at `/runtime/webhooks/mcp` behind the
platform system key.

**Project Type**: Backend-only extension of the existing web service (no
dashboard changes).

**Performance Goals**: N/A beyond existing behavior — `trigger_price_refresh`
may take as long as the scheduled refresh (spec assumption; agents tolerate a
slow response).

**Constraints**: MCP `toolProperties` schema is flat
(`{propertyName, propertyType, description, isRequired}`) — no nested objects;
numeric args may arrive as strings and are parsed in handlers. Writes must
never half-apply; audit append failure must never fail the write (logged and
swallowed).

**Scale/Scope**: Single user, human-driven write volume (a few writes/week).
Audit grows unbounded by design (v1, tiny volume). ~5 new/changed tools, 2 new
use-case-layer files, 1 new domain service, 1 new interface + repository, edits
to 4 existing files.

## Constitution Check

*GATE: evaluated against constitution v1.1.1 — PASS (pre-Phase 0 and re-checked post-Phase 1).*

| Principle | Verdict | Notes |
|---|---|---|
| I. Privacy First | PASS | No new egress; audit data stays in the private Azure store. Tests and docs use placeholder brokers/symbols/values only. No credentials touched; MCP auth unchanged (platform key). |
| II. Clean Architecture / DDD | PASS | `mcp.js` handlers stay thin (parse → container use case → stringify). Guard math is a pure domain service; guardrail orchestration is a use case; audit is an interface in `application/interfaces` implemented in `infrastructure/repositories`; new table registered in `AzureTableDatabase`. |
| III. Idempotent Data Operations | PASS | No seeder changes. Audit is append-only (no overwrites). `AddPosition` gains an explicit duplicate rejection — strictly safer. Updates keep patch semantics. |
| IV. Pragmatic Testing | PASS | Unit tests target exactly where bugs hurt: guard math, threshold/confirm flow, null-strip, duplicate pre-check, executionPrice validation, audit old/new capture. No UI/one-off-script tests. |
| V. Convention-Driven Workflow | PASS | Branch `018-mcp-write-tools` matches spec dir; SDD pipeline followed (spec → plan → tasks → analyze → implement). |

Storage note: the constitution's Tech Stack section enumerates the original
four tables, but adding tables *within* Azure Table Storage follows established
precedent (`portfolioAnalysis`, `portfolioOrders`, `portfolioInstructionsHistory`
were added by features 002/006/007 without amendment). The prohibition is on
introducing a different database engine — none is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/018-mcp-write-tools/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R10
├── data-model.md        # Phase 1 — AuditEntry, SuggestedOrder.executionPrice, threshold setting
├── quickstart.md        # Phase 1 — local run + manual tool exercise
├── contracts/
│   └── mcp-tools.md     # Phase 1 — tool-by-tool input/output/error contract
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── services/
│   │   └── QuantityChangeGuard.js          # NEW — pure: (oldQty, newQty, thresholdPct) → {exceeds, changePct}
│   └── entities/
│       └── SuggestedOrder.js               # EDIT — optional executionPrice field + validation
├── application/
│   ├── interfaces/
│   │   ├── IAuditRepository.js             # NEW — append(entry), listRecent(limit)
│   │   └── index.js                        # EDIT — export IAuditRepository
│   ├── use-cases/
│   │   ├── positions/
│   │   │   ├── GuardedUpdatePosition.js    # NEW — threshold guard + confirm flag + null-strip → UpdatePosition
│   │   │   ├── UpdatePosition.js           # EDIT — optional auditRepository dep; append old/new on success
│   │   │   ├── AddPosition.js              # EDIT — duplicate pre-check (DomainError w/ pointer); optional audit
│   │   │   └── index.js                    # EDIT — export GuardedUpdatePosition
│   │   ├── analysis/
│   │   │   └── SetOrderExecutionStatus.js  # EDIT — optional executionPrice input; optional audit
│   │   ├── audit/
│   │   │   ├── ListAuditEntries.js         # NEW — thin: listRecent(limit) with bounds
│   │   │   └── index.js                    # NEW
│   │   ├── prices/
│   │   │   └── RefreshPrices.js            # EDIT — optional audit (operation summary entry)
│   │   └── index.js                        # EDIT — barrel exports
│   └── di/
│       └── container.js                    # EDIT — getAuditRepository(), getGuardedUpdatePosition(), getListAuditEntries(); wire audit into existing factories
├── infrastructure/
│   └── repositories/
│       └── AzureAuditRepository.js         # NEW — portfolioAudit, inverted-timestamp rowKeys
├── database/
│   └── AzureTableDatabase.js               # EDIT — auditClient + initialize() entry
└── functions/
    └── mcp.js                              # EDIT — 4 write tools + list_audit_entries; richer error serialization

tests/unit/
├── domain/
│   ├── QuantityChangeGuard.test.js         # NEW
│   └── SuggestedOrder.executionPrice.test.js  # NEW (or extend existing entity test)
├── application/
│   ├── positions/
│   │   ├── GuardedUpdatePosition.test.js   # NEW — threshold, confirm, zero-qty, null-strip, audit ctx
│   │   ├── AddPosition.test.js             # EDIT — duplicate pre-check cases
│   │   └── UpdatePosition.test.js          # EDIT — audit append old/new
│   ├── use-cases/analysis/
│   │   └── SetOrderExecutionStatus.test.js # EDIT — executionPrice validation + patch passthrough
│   └── audit/
│       └── ListAuditEntries.test.js        # NEW
└── infrastructure/
    └── AzureAuditRepository.test.js        # NEW — rowKey inversion, entity mapping
```

**Structure Decision**: Single-project backend extension following the existing
clean-architecture layout — domain service in `src/domain/services/`, use cases
under `src/application/use-cases/` (new `audit/` group), interface in
`src/application/interfaces/`, repository in
`src/infrastructure/repositories/`, thin handlers in `src/functions/mcp.js`.
No dashboard changes.

## Key Design Decisions (from research.md)

- **R2/R4**: Guardrail lives in a new `GuardedUpdatePosition` wrapper (MCP path
  only) so dashboard PUT semantics are untouched; guard math is a pure domain
  service. Threshold setting key: `mcpQuantityChangeThresholdPct`, default 50,
  conservative fallback on invalid/absent.
- **R3**: Audit recording is an optional constructor dep **inside the shared use
  cases**, so both agent and dashboard writes audit (concurrent-writes edge
  case). Audit failures never fail the write. `portfolioAudit`: PK `'audit'`,
  RK `inverted-ms-timestamp + '-' + random4` → newest-first native ordering.
- **R5**: `GuardedUpdatePosition` strips `null`/`undefined` patch keys — FR-002
  satisfied without changing `UpdatePosition`'s `field in input` merge (which
  today throws on explicit null averageCost).
- **R6**: `AddPosition` pre-checks `findById` and throws `DomainError` (422)
  pointing at the existing position; storage 409 remains as race backstop.
- **R7**: `executionPrice` added end-to-end (entity → mappers → repo merge →
  use case → PATCH endpoint passthrough → `get_weekly_analysis` output);
  scorecard intentionally ignores it (stored-not-scored).
- **R8**: `tool()` wrapper serializes `{ error, code, details }` so
  `ValidationError.validationErrors`, guardrail retry instructions, and
  duplicate pointers reach the agent (FR-007/SC-004).

## Complexity Tracking

No constitution violations to justify. (New `portfolioAudit` table is additive
within the approved storage engine — see Constitution Check storage note.)
