# Research: MCP Write Tools for Conversational Portfolio Maintenance

**Feature**: 018-mcp-write-tools | **Date**: 2026-07-21

All unknowns from Technical Context resolved below. No new dependencies, no new
external services; every decision reuses an existing repo pattern.

## R1. MCP tool registration mechanism

**Decision**: Register the four write tools (plus one audit read tool) in the
existing `src/functions/mcp.js` via `app.mcpTool(name, { toolName, description,
toolProperties, handler })`, reusing the existing `tool()` wrapper that reads
args from `context.triggerMetadata.mcptoolargs` and JSON-stringifies results.

**Rationale**: The Azure Functions MCP extension (Streamable HTTP on
`/runtime/webhooks/mcp`, behind the platform system key) already hosts the four
read-only tools. `toolProperties` is the extension's own
`{ propertyName, propertyType, description, isRequired }` shape — not JSON
Schema — so tool inputs must be flat scalars (string/integer/boolean via string
where needed). Numbers arriving as strings are parsed in the handler before
delegation.

**Alternatives considered**: Standalone MCP server (new process/package) —
rejected: duplicates auth, DI, and deployment for zero benefit; FR-010 says the
platform key posture is sufficient in v1.

## R2. Where the write logic lives (validation parity, FR-003)

**Decision**: Every MCP write delegates to the existing use-case layer through
the DI container (`src/application/di/container.js`), exactly like the HTTP
functions do:

- `update_position` → new `GuardedUpdatePosition` use case that wraps the
  existing `UpdatePosition` (guardrail + null-stripping + audit context), never
  bypassing it.
- `create_position` → existing `AddPosition` (extended with a duplicate
  pre-check, see R6).
- `set_order_execution_status` → existing `SetOrderExecutionStatus` (extended
  with optional `executionPrice`, see R7).
- `trigger_price_refresh` → existing `RefreshPrices` unchanged in behavior
  (already returns `{ totalSymbols, succeeded, failed, durationMs }`).

**Rationale**: Constitution II — no business rules in function handlers; the
agent path cannot persist anything the dashboard path would reject because it
runs the same code. `mcp.js` stays thin: parse args → use case → stringify.

**Alternatives considered**: Guardrail logic inside the mcp.js handlers —
rejected (business rule in an entry point, violates Constitution II and makes
it untestable at use-case level).

## R3. Audit trail storage & recording point

**Decision**: New Azure table `portfolioAudit`, append-only.

- Keying: `partitionKey = 'audit'` (single partition), `rowKey =
  <inverted-timestamp-ms, 13 digits> + '-' + <4-char random suffix>` so Azure's
  native ascending rowKey order returns newest-first without a sort, and
  same-millisecond writes never collide.
- Columns: `timestamp` (ISO), `operation`
  (`update_position | create_position | set_order_execution_status |
  price_refresh`), `targetType` (`position | order | prices`), `targetId`
  (e.g. `iol/bond__GD35`, `2026-07-14/02`, `all-open`), `changes` (JSON string:
  `[{ field, old, new }]`), `confirmationUsed` (boolean), `source`
  (`mcp | api | timer`).
- New `IAuditRepository` interface (`append(entry)`, `listRecent(limit)`) in
  `src/application/interfaces/`, implemented by `AzureAuditRepository`
  extending the existing `AzureTableRepository` base; table client added to
  `AzureTableDatabase` alongside the seven existing tables.

**Recording point**: inside the use cases themselves, via an **optional
`auditRepository` constructor dependency** (same optional-dep resilience
pattern as `GenerateWeeklyAnalysis`'s `allocationTargetsRepository`): when
wired, each successful write appends one entry with field-level old/new values;
when absent (old tests, hypothetical minimal wiring), the write still works.
Audit append failures are logged and swallowed — a write must never fail
because the audit row could not be written, but the failure is visible in logs.
Callers pass an optional audit context `{ source, confirmationUsed }`; default
source is `api`.

**Rationale**: Putting audit in the use case (not the MCP handler) satisfies
the spec's concurrent-writes edge case — dashboard/API writes to the same
records are audited too, so "both writes appear in the audit trail". Volume is
tiny (human-driven), so a single partition is fine indefinitely (spec: no
retention policy in v1). Inverted-timestamp rowKeys are the standard Azure
Tables recent-first idiom.

**Alternatives considered**: (a) Audit only in mcp.js handlers — rejected:
misses dashboard writes (edge case) and puts logic in the entry point.
(b) Per-day partitions — rejected: complicates "list recent" across days for
no benefit at this volume. (c) Blocking the write when audit append fails —
rejected: availability of bookkeeping beats audit completeness in a
single-user system; failures still surface in logs.

## R4. Quantity-change guardrail (FR-004)

**Decision**: Pure domain service `QuantityChangeGuard`
(`src/domain/services/QuantityChangeGuard.js`): given `(oldQuantity,
newQuantity, thresholdPct)` returns `{ exceeds, changePct }` where reduction to
zero always sets `exceeds: true`. Enforced in the new `GuardedUpdatePosition`
use case: it loads the current position, evaluates the guard when `quantity` is
present in the patch, and if `exceeds` and no `confirm: true` flag was passed,
throws a `DomainError` whose message states the change magnitude, the
threshold, and instructs to retry with `confirm: true`. The audit entry records
`confirmationUsed` when the flag was used.

Threshold configuration: `portfolioSettings` row with key
`mcpQuantityChangeThresholdPct` read per call through the existing
`ISettingsRepository`; absent, non-numeric, or out-of-range (≤0 or >100) values
fall back to the conservative default **50**.

**Rationale**: Guard math is a pure domain rule (unit-testable in isolation);
the settings-read-with-fallback mirrors `GenerateWeeklyAnalysis._getSettingNumber`.
The guardrail applies only to the MCP path (the dashboard has its own
deliberate edit UI), which is why it lives in the wrapper use case rather than
inside `UpdatePosition` — pushing it into `UpdatePosition` would break existing
dashboard edits that don't send a flag.

**Alternatives considered**: Env-var threshold — rejected: spec says "an app
setting" the owner can tune without redeploying; `portfolioSettings` already
has GET/PUT endpoints.

## R5. Null-preserves semantics for partial updates (FR-002)

**Decision**: `GuardedUpdatePosition` strips keys whose value is `null` or
`undefined` from the patch before delegating to `UpdatePosition`, so an
explicit `averageCost: null` (or any nulled field) preserves the stored value.

**Rationale**: Today `UpdatePosition` uses `if (field in input)` merge
semantics, so a present-but-null `averageCost` reaches the `Position`
constructor and **throws** ("Average cost must be a non-negative number") —
only an absent key preserves the stored value. Agents routinely serialize
"don't change" as `null`, so the MCP boundary must normalize. Stripping in the
wrapper leaves `UpdatePosition`'s HTTP semantics untouched (no behavior change
for the dashboard path).

**Alternatives considered**: Changing `UpdatePosition` itself to skip nulls —
rejected for v1: silently changes PUT semantics for every existing caller;
out of this feature's blast radius.

## R6. Duplicate-creation rejection (FR-009)

**Decision**: Add an explicit pre-check in `AddPosition`: before saving, call
`positionRepository.findById(brokerId, rowKey)`; if an open position exists,
throw a `DomainError` (422) whose message points at the existing record and
says to use `update_position` instead. The storage-level 409 →
`InfrastructureError` path remains as a race backstop.

**Rationale**: Today a duplicate create surfaces as a 502
`InfrastructureError('Position already exists…')` — wrong status and not
self-explanatory (FR-007). Fixing it in `AddPosition` benefits the HTTP path
too and keeps parity (FR-003).

## R7. Execution price on suggested orders (FR-005)

**Decision**: Add optional `executionPrice` (number > 0 or null, default null)
to the `SuggestedOrder` entity, the `portfolioOrders` mappers
(`_orderToEntity` / `_orderFromEntity`), the
`AzureAnalysisRepository.setOrderExecutionStatus` merge patch, and the
`SetOrderExecutionStatus` use case input (validated: optional, finite,
positive). The existing HTTP PATCH endpoint passes it through; the
`get_weekly_analysis` MCP tool surfaces it in its order mapping. The scorecard
does **not** consume it (stored-not-scored per spec assumption; outcome-P&L is
roadmap P3-2).

**Rationale**: Orders are identified by `analysisDate + index`
(`PK = analysisDate`, `RK = zero-padded index`) — the MCP tool takes `date` and
`index` args matching the existing PATCH route. Status vocabulary reuses the
exported `EXECUTION_STATUSES = ['pending','executed','partial','skipped']`.

## R8. Self-explanatory rejection messages (FR-007)

**Decision**: Extend the `tool()` wrapper in `mcp.js` to serialize errors as
`{ error: message, code: err.name, details: err.validationErrors ?? undefined }`
instead of message-only, so `ValidationError` field lists, the guardrail's
retry-with-confirm instruction, and the duplicate pointer all reach the agent
verbatim.

**Rationale**: The current wrapper returns `{ error: err.message }` only —
field-level details from `ValidationError.validationErrors` are dropped, which
would force agents to guess (violates FR-007/SC-004).

## R9. Concurrency & refresh overlap

**Decision**: No new locking. Last-write-wins for concurrent position edits is
accepted by the spec (both writes audited — covered by R3). Price-refresh
overlap keeps the existing posture: the timer relies on the Functions singleton
behavior; a concurrent MCP trigger runs redundantly but each position update is
a single-entity write, so nothing is ever half-updated.

**Rationale**: Matches spec edge cases verbatim; adding job queuing is
explicitly out of scope for v1.

## R10. Testing approach

**Decision**: Jest unit tests following the existing plain-object-mock-repo
pattern (`tests/unit/application/...`): `QuantityChangeGuard` (pure),
`GuardedUpdatePosition` (threshold/confirm/null-strip/audit paths),
`AddPosition` duplicate pre-check, `SetOrderExecutionStatus` executionPrice
validation + persistence patch, `SuggestedOrder` entity price validation,
`AzureAuditRepository` rowKey ordering (unit, mocked table client), and audit
side-effects (entries appended with correct old/new values). No MCP-transport
integration tests (the extension is platform-hosted); the `tool()` wrapper's
error serialization gets a small unit test by requiring `mcp.js` handlers
indirectly or factoring the wrapper — kept pragmatic per Constitution IV.
