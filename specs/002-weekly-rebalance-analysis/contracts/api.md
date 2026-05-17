# HTTP API Contracts

Two new read-only endpoints. Both mirror the existing read endpoints (`GET /api/positions`, `GET /api/brokers`) in auth posture (anonymous), CORS handling (inherits from function-app defaults), and response shape (JSON, `application/json; charset=utf-8`).

No write endpoints. No PATCH. No manual-trigger POST. Recovery uses Azure portal Test/Run on the timer function.

---

## GET `/api/analysis/weekly`

List of past weekly analyses, reverse-chronological.

### Request

```http
GET /api/analysis/weekly?limit=20
```

| Query param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | `20` | Max rows to return. Capped at 200. |

No body. No auth.

### Response 200

```json
{
  "items": [
    {
      "date": "2026-05-15",
      "status": "completed",
      "summary": "Allocation drift toward equities; one trim, one add suggested.",
      "modelUsed": "claude-opus-4-7",
      "riesgoPaisBp": 524,
      "riesgoPaisAsOf": "2026-05-15",
      "orderCount": 2,
      "costUsd": 1.18,
      "generatedAt": "2026-05-15T21:00:14Z"
    },
    {
      "date": "2026-05-08",
      "status": "failed",
      "errorMessage": "riesgo-pais source unreachable (timeout)",
      "modelUsed": "claude-opus-4-7",
      "generatedAt": "2026-05-08T21:00:09Z"
    }
  ]
}
```

Field notes:
- Failed rows omit `summary`, `riesgoPaisBp`, `riesgoPaisAsOf`, `orderCount`, `costUsd`. The list endpoint deliberately includes both completed and failed rows so the dashboard can render the failure entries (User Story 3).
- `summary` is the one-paragraph executive summary, NOT the full narrative body. The full body is fetched by the detail endpoint.

### Response 500

```json
{ "error": "internal_error", "message": "unexpected server error" }
```

Plain shape, no stack traces, no PII.

---

## GET `/api/analysis/weekly/{date}`

Full detail for one weekly analysis.

### Request

```http
GET /api/analysis/weekly/2026-05-15
```

| Path param | Type | Notes |
|---|---|---|
| `date` | string `YYYY-MM-DD` | Must match an existing record. |

No body. No auth.

### Response 200 (completed run)

```json
{
  "date": "2026-05-15",
  "status": "completed",
  "generatedAt": "2026-05-15T21:00:14Z",
  "modelUsed": "claude-opus-4-7",
  "promptVersion": "weekly-rebalance-v1",
  "summary": "Allocation drift toward equities; one trim, one add suggested.",
  "markdownBody": "## Executive summary\n\n…full narrative in markdown…",
  "riesgoPaisBp": 524,
  "riesgoPaisAsOf": "2026-05-15",
  "tokensIn": 42105,
  "tokensOut": 3812,
  "costUsd": 1.18,
  "durationMs": 47200,
  "orders": [
    {
      "index": 0,
      "broker": "ibkr",
      "symbol": "MU",
      "side": "sell",
      "quantity": 25,
      "rationale": "Trim per standing TRIM directive (chip-sector concentration). Conviction medium; redeploy proceeds to ARG bucket per next order.",
      "conviction": "medium"
    },
    {
      "index": 1,
      "broker": "galicia",
      "symbol": "GD41D",
      "side": "buy",
      "quantity": 12,
      "rationale": "Riesgo país at 524 bp (below 600 bp trigger) — ARG-bucket default deploy target. Per-100-nominales pricing applies. Galicia preferred for 0.25% commission on sovereigns.",
      "conviction": "medium"
    }
  ]
}
```

Notes:
- `orders` is always present (may be empty array) when `status === "completed"`.
- `markdownBody` is the full narrative; the client renders it with `marked` + `DOMPurify`.
- `portfolioSnapshot` (per the data model) is NOT included in this response — it's persisted on the row but not exposed via the API. It's a server-side input to the next run, not a dashboard-facing artifact.

### Response 200 (failed run)

```json
{
  "date": "2026-05-08",
  "status": "failed",
  "generatedAt": "2026-05-08T21:00:09Z",
  "modelUsed": "claude-opus-4-7",
  "promptVersion": "weekly-rebalance-v1",
  "errorMessage": "riesgo-pais source unreachable (timeout)",
  "tokensIn": 0,
  "tokensOut": 0,
  "costUsd": 0,
  "durationMs": 10210,
  "orders": []
}
```

### Response 404

```json
{ "error": "not_found", "message": "no analysis exists for 2026-05-08" }
```

### Response 400

```json
{ "error": "bad_request", "message": "invalid date format; expected YYYY-MM-DD" }
```

---

## Internal contract — Anthropic `submit_analysis` tool

The `submit_analysis` tool's JSON schema is the contract between `GenerateWeeklyAnalysis` and the model. The actual schema is checked-in at [submit-analysis-tool.json](./submit-analysis-tool.json). The use-case:

1. Provides the schema as the `tools[0].input_schema` of the SDK request.
2. Sets `tool_choice: { type: "tool", name: "submit_analysis" }` to force tool use.
3. Validates the returned `tool_use.input` against the same schema (defense-in-depth) before persisting.

A schema mismatch is a `failed` run with `errorMessage = "tool_use schema validation failed: <details>"`.

---

## CORS / auth posture

- Both endpoints inherit the function app's CORS configuration (already permissive for the dashboard origin in dev and prod).
- `authLevel: 'anonymous'` — same as existing `GET /api/positions`, `GET /api/brokers`. The dashboard fetches without keys.
- Real protection comes from the function app's network ACLs at the Azure layer (deployment concern, not a code change).
