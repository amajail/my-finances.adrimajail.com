# Tasks: MCP Write Tools for Conversational Portfolio Maintenance

**Input**: Design documents from `/specs/018-mcp-write-tools/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R10), data-model.md, contracts/mcp-tools.md

**Tests**: Included — Constitution IV requires tests for domain services, entities, and use-cases; each story's spec defines an Independent Test. Written alongside implementation (not strict TDD).

**Organization**: Foundational audit infrastructure first (every write depends on it), then user stories in priority order. Each story phase ends independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = order status recording, US2 = position update, US3 = position creation, US4 = price refresh

## Phase 1: Setup

*No setup tasks — no new dependencies, no project scaffolding. Existing Jest/Azurite/func tooling applies.*

---

## Phase 2: Foundational — Audit Trail Infrastructure (Blocking Prerequisites)

**Purpose**: The append-only audit trail (FR-006) and MCP error serialization (FR-007) that every write tool depends on. No user story can record a write without it.

- [X] T001 [P] Create `IAuditRepository` interface (`append(entry)`, `listRecent(limit)`) in src/application/interfaces/IAuditRepository.js, following the JSDoc'd not-implemented-throw pattern of the sibling interfaces; export it from src/application/interfaces/index.js
- [X] T002 [P] Register `portfolioAudit` table client in src/database/AzureTableDatabase.js (constructor + `initialize()` clients array), alongside the existing seven tables
- [X] T003 Implement `AzureAuditRepository` extending `AzureTableRepository` in src/infrastructure/repositories/AzureAuditRepository.js: PK `'audit'`, RK = `String(9_999_999_999_999 - epochMs).padStart(13,'0') + '-' + <4-char random suffix>`, `_toEntity`/`_fromEntity` mappers per data-model.md §1 (changes/details as JSON-string columns), `append` via `createEntity`, `listRecent(limit)` clamped 1..100 default 20 (native ascending scan = newest first); injectable clock for tests
- [X] T004 [P] Create `ListAuditEntries` use case in src/application/use-cases/audit/ListAuditEntries.js (+ src/application/use-cases/audit/index.js barrel): validate/clamp `limit`, delegate to `auditRepository.listRecent`; export from src/application/use-cases/index.js
- [X] T005 Wire container in src/application/di/container.js: memoized `getAuditRepository()` singleton + `getListAuditEntries()` factory (same shape as `getPositionRepository`/`getListPositions`)
- [X] T006 In src/functions/mcp.js: extend the `tool()` wrapper to serialize errors as `{ error: message, code: err.name, details: err.validationErrors ?? undefined }` (research R8), and register the `list_audit_entries` MCP tool (optional `limit` arg, parsed int) per contracts/mcp-tools.md §5
- [X] T007 [P] Unit tests: tests/unit/infrastructure/AzureAuditRepository.test.js (rowKey inversion orders newest-first, same-ms suffix uniqueness, JSON round-trip of changes/details, limit clamping) and tests/unit/application/audit/ListAuditEntries.test.js (mock repo, limit bounds)

**Checkpoint**: `list_audit_entries` returns `[]` against a fresh store; audit repo unit-tested; error wrapper carries validation details.

---

## Phase 3: User Story 1 — Record what I did with a suggestion (Priority: P1) 🎯 MVP

**Goal**: `set_order_execution_status` MCP tool records status + optional execution price on a suggested order, with audit entry; scorecard reflects it.

**Independent Test**: Via an MCP session set an order's status to each allowed value with and without `executionPrice`; verify stored values, scorecard update, rejection message for a bad status listing allowed values, and the audit entry with old/new values (spec US1 acceptance 1–3).

- [X] T008 [P] [US1] Add optional `executionPrice` field to src/domain/entities/SuggestedOrder.js: constructor default `null`, validation (when non-null: finite number > 0, else `ValidationError`), include in `toJSON`/`fromJSON` per data-model.md §2
- [X] T009 [US1] Persist `executionPrice` in src/infrastructure/repositories/AzureAnalysisRepository.js: `_orderToEntity`/`_orderFromEntity` mappers (absent column reads as `null`) and add it to the `setOrderExecutionStatus(date, index, patch)` Merge patch
- [X] T010 [US1] Extend `SetOrderExecutionStatus` use case in src/application/use-cases/analysis/SetOrderExecutionStatus.js: accept optional `executionPrice` (validate finite > 0), pass in repo patch, add optional `auditRepository` constructor dep (research R3) — on success append entry `{ operation: 'set_order_execution_status', targetType: 'order', targetId: '{date}/{index}', changes: old/new for status/note/executionPrice, source }` reading the pre-change order for old values; audit append failures logged + swallowed
- [X] T011 [P] [US1] Pass optional `executionPrice` through the existing HTTP endpoint body in src/functions/setOrderExecutionStatus.js (PATCH parity, contracts §Side contract)
- [X] T012 [US1] Wire audit into `getSetOrderExecutionStatus()` in src/application/di/container.js (inject `auditRepository`); register `set_order_execution_status` MCP tool in src/functions/mcp.js (args date/index/status/executionPrice/note, parse index int + price float, audit context `{ source: 'mcp' }`) per contracts §3, and surface `executionPrice` in the `get_weekly_analysis` tool's order mapping
- [X] T013 [P] [US1] Tests: extend tests/unit/domain/ SuggestedOrder entity test with executionPrice validation cases (or new tests/unit/domain/SuggestedOrder.executionPrice.test.js); extend tests/unit/application/use-cases/analysis/SetOrderExecutionStatus.test.js — price accepted/validated/persisted in patch, invalid status message lists allowed values, audit entry appended with old/new, write succeeds when audit repo throws, backward-compat when no auditRepository injected

**Checkpoint**: US1 fully functional — order outcome recordable conversationally with price; audit queryable; scorecard unchanged in math but current.

---

## Phase 4: User Story 2 — Adjust a position from a conversation (Priority: P2)

**Goal**: `update_position` MCP tool with quantity-change guardrail (confirm flag), null-preserves semantics, validation parity, audit.

**Independent Test**: Update quantity/notes/maturityDate via MCP; over-threshold change without confirm is rejected with magnitude+threshold+how-to-confirm; with confirm succeeds and audit notes it; `averageCost: null` preserves stored PPC; negative quantity rejected with the dashboard-path message (spec US2 acceptance 1–5).

- [ ] T014 [P] [US2] Create pure domain service `QuantityChangeGuard` in src/domain/services/QuantityChangeGuard.js: `evaluate(oldQty, newQty, thresholdPct) → { exceeds, changePct }` — new=0 always exceeds, old=0→new>0 exceeds, else `|Δ|/old×100 > threshold` (data-model.md §3)
- [ ] T015 [US2] Add optional `auditRepository` dep to `UpdatePosition` in src/application/use-cases/positions/UpdatePosition.js: on success append `{ operation: 'update_position', targetType: 'position', targetId: '{brokerId}/{rowKey}', changes: field-level old/new for applied fields, confirmationUsed, source }` from an optional `_audit` input context (default source `'api'`); append failure logged + swallowed; no behavior change for existing callers
- [ ] T016 [US2] Create `GuardedUpdatePosition` use case in src/application/use-cases/positions/GuardedUpdatePosition.js (export via positions/index.js + use-cases barrel): deps `{ updatePosition, positionRepository, settingsRepository }`; strip `null`/`undefined` patch keys (research R5); when `quantity` present, read `mcpQuantityChangeThresholdPct` setting (fallback 50 on absent/NaN/≤0/>100), evaluate `QuantityChangeGuard` against the stored position, and without `confirm: true` throw `DomainError` stating change %, threshold %, and "retry with confirm: true" (FR-004); delegate to `updatePosition.execute` with `_audit: { source: 'mcp', confirmationUsed }`
- [ ] T017 [US2] Wire `getGuardedUpdatePosition()` in src/application/di/container.js (inject UpdatePosition-with-audit + position/settings repos); register `update_position` MCP tool in src/functions/mcp.js per contracts §1 (args broker/rowKey/quantity/averageCost/notes/status/maturityDate/confirm; parse numerics/boolean, drop unsent args so they don't appear as null keys)
- [ ] T018 [P] [US2] Tests: tests/unit/domain/QuantityChangeGuard.test.js (under/over/at threshold, to-zero, from-zero, changePct math); tests/unit/application/positions/GuardedUpdatePosition.test.js (threshold rejection message content, confirm succeeds + confirmationUsed audited, null averageCost preserves stored value, invalid threshold setting falls back to 50, non-quantity patch skips guard); extend tests/unit/application/positions/UpdatePosition.test.js (audit entry old/new, resilience when audit throws, no-audit backward compat)

**Checkpoint**: US1 + US2 work independently; dashboard PUT path behavior unchanged (now audited).

---

## Phase 5: User Story 3 — Add a new position conversationally (Priority: P3)

**Goal**: `create_position` MCP tool with full validation, duplicate rejection pointing at the existing record, audit.

**Independent Test**: Create a valid position via MCP → appears in `list_positions` with audit entry; create the same broker/assetType/symbol again → rejected with pointer to the existing position (spec US3 acceptance 1–2).

- [ ] T019 [US3] Extend `AddPosition` in src/application/use-cases/positions/AddPosition.js: pre-check `positionRepository.findById(brokerId, rowKey)` — if an open position exists throw `DomainError` naming `{brokerId}/{assetType}__{symbol}` and suggesting `update_position` (FR-009, research R6; storage 409 stays as race backstop); add optional `auditRepository` dep — on success append `{ operation: 'create_position', changes: provided fields with old: null, source }`
- [ ] T020 [US3] Wire audit into `getAddPosition()` in src/application/di/container.js; register `create_position` MCP tool in src/functions/mcp.js per contracts §2 (required broker/assetType/symbol/quantity/averageCost/currency + optional displayName/maturityDate/notes; parse numerics; `_audit: { source: 'mcp' }`)
- [ ] T021 [P] [US3] Tests: extend tests/unit/application/positions/AddPosition.test.js — duplicate open position → DomainError with pointer message, closed existing position allows re-create (open/closed lifecycle), audit entry on create, missing-field ValidationError unchanged

**Checkpoint**: All position writes conversational; no delete tool anywhere (FR-001 — closing = `update_position` status `closed`).

---

## Phase 6: User Story 4 — Refresh prices on demand (Priority: P3)

**Goal**: `trigger_price_refresh` MCP tool reusing `RefreshPrices`, reporting the summary, with audit entry.

**Independent Test**: Trigger via MCP → response contains refreshed/failed counts; `list_audit_entries` shows a `price_refresh` entry with the summary (spec US4 acceptance 1).

- [ ] T022 [US4] Add optional `auditRepository` dep to `RefreshPrices` in src/application/use-cases/prices/RefreshPrices.js: on completion append `{ operation: 'price_refresh', targetType: 'prices', targetId: 'all-open', changes: [], details: { totalSymbols, succeeded, failed }, source }` (default `'api'`; timer passes `'timer'` via existing container wiring if trivial — otherwise timer stays unaudited-by-source-default); append failure logged + swallowed
- [ ] T023 [US4] Wire audit into `getRefreshPrices()` in src/application/di/container.js; register `trigger_price_refresh` MCP tool (no args) in src/functions/mcp.js per contracts §4, `_audit: { source: 'mcp' }`
- [ ] T024 [P] [US4] Tests: extend tests/unit/application/prices/RefreshPrices.test.js — audit entry with summary details, resilience when audit repo throws, no-audit backward compat

**Checkpoint**: All four write tools + audit read tool live.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T025 Update the MCP server self-description in host.json (`extensions.mcp.instructions` currently says read-only): describe the write tools, the confirm-flag guardrail, no-delete posture, and audit trail; bump `serverVersion`
- [ ] T026 Run full suite `npx jest` — all green (pr-checks.yml gate); fix any regression in the same change
- [ ] T027 Validate quickstart.md end-to-end locally (Azurite + `func start` + an MCP client): walk steps 1–7 with placeholder data only (Constitution I — no real symbols/quantities/PPCs in any committed artifact or output)

---

## Dependencies & Execution Order

- **Phase 2 (Foundational)** blocks everything: T001 → T003 → T005 → T006; T002 [P] alongside T001; T004 after T001; T007 after T003/T004.
- **US1 (Phase 3)**: T008 → T009 → T010 → T012; T011 and T013 parallel after T010. Depends only on Phase 2.
- **US2 (Phase 4)**: T014 [P] anytime after Phase 2; T015 → T016 → T017; T018 after T016. Independent of US1 (different files except container/mcp.js — sequential edits there).
- **US3 (Phase 5)**: T019 → T020 → T021. Independent of US1/US2 (same container/mcp.js caveat).
- **US4 (Phase 6)**: T022 → T023 → T024. Independent of other stories.
- **Phase 7** after all desired stories.

`src/application/di/container.js` and `src/functions/mcp.js` are touched by every story — when implementing stories in parallel, serialize edits to those two files; all other files are story-disjoint.

## Parallel Example: after Phase 2 completes

```text
Track A (US1): T008 → T009 → T010 → [T011 ∥ T013] → T012
Track B (US2): [T014 ∥ T015] → T016 → T017 → T018
Track C (US3): T019 → T020 → T021
Track D (US4): T022 → T023 → T024
(container.js / mcp.js edits serialized across tracks)
```

## Implementation Strategy

**MVP = Phase 2 + Phase 3 (US1)**: audit infrastructure + order-outcome recording — the highest-frequency, lowest-risk write that "pays for itself weekly". Stop, validate against US1's Independent Test, then add US2 → US3 → US4 incrementally; each story is a deployable increment that doesn't break the previous ones.

**Total**: 27 tasks (Foundational 7, US1 6, US2 5, US3 3, US4 3, Polish 3).
