# Quickstart: MCP Write Tools

**Feature**: 018-mcp-write-tools

## Run locally

```bash
# 1. Start Azurite (tables) in one terminal
azurite --silent --location .azurite

# 2. Start the Functions host in another
npm install
func start        # API on http://localhost:7071/api, MCP on /runtime/webhooks/mcp

# 3. (First run) seed brokers + placeholder positions
node scripts/seed-brokers.js
node scripts/seed-positions.js   # uses scripts/positions.json (local, gitignored)
```

The MCP endpoint is `http://localhost:7071/runtime/webhooks/mcp` (locally no
system key is required; in Azure the `mcp_extension` system key applies).

## Exercise the tools

Connect any MCP client (e.g. Claude Code: `claude mcp add --transport http
my-finances http://localhost:7071/runtime/webhooks/mcp`) and try, using
placeholder data:

1. **Record an order outcome** (US1):
   `set_order_execution_status(date: "2026-07-14", index: "0", status: "executed", executionPrice: "42.50")`
   → response echoes status + price; `get_weekly_analysis` shows the price;
   scorecard execution rate updates.
2. **Small position update** (US2):
   `update_position(broker: "iol", rowKey: "bond__SYMBOL", notes: "test")` → succeeds.
3. **Guardrail** (US2): send a quantity change > 50% without `confirm` →
   rejection message states change %, threshold, and how to confirm; retry with
   `confirm: "true"` → succeeds, audit entry flags `confirmationUsed: true`.
4. **Null preserves** (US2): `update_position(..., averageCost: null)` → stored
   PPC unchanged.
5. **Create + duplicate** (US3): `create_position(...)` twice → second call is
   rejected pointing at the existing position.
6. **Refresh** (US4): `trigger_price_refresh()` → `{ totalSymbols, succeeded, failed }`.
7. **Audit** (FR-006): `list_audit_entries(limit: "10")` → newest-first entries
   with field-level old/new values.

## Tune the guardrail

```bash
curl -X PUT http://localhost:7071/api/settings/mcpQuantityChangeThresholdPct \
  -H 'Content-Type: application/json' -d '{"value":"30"}'
```

Absent or invalid values fall back to 50%.

## Tests

```bash
npx jest tests/unit/domain/QuantityChangeGuard.test.js \
         tests/unit/application/positions/GuardedUpdatePosition.test.js \
         tests/unit/application/audit tests/unit/infrastructure/AzureAuditRepository.test.js
npx jest   # full suite — must stay green (pr-checks.yml)
```
