# Data Model: Dividend & Maturity Calendar (017)

No persisted entities — the feature is computed-on-request (FR-006). These are in-memory/DTO shapes.

## CalendarEvent (DTO — produced by `CalendarEventBuilder`, returned by API)

| Field | Type | Rules |
|---|---|---|
| `type` | `"maturity" \| "dividend-ex" \| "dividend-payment"` | required |
| `date` | ISO `YYYY-MM-DD` | required; source: `maturityDate` or Yahoo calendarEvents |
| `daysUntil` | integer | `date − today` in days; **negative ⇒ overdue** (maturities only) |
| `overdue` | boolean | `type === "maturity" && daysUntil < 0` (FR-009); dividend events are never emitted with past dates |
| `symbol` | string | from position |
| `broker` | string | broker slug |
| `assetType` | string | from position |
| `quantity` | number | held quantity at computation time |
| `amountNative` | number \| null | maturity: `quantity × faceValue/100` in instrument currency; dividend: `perShareEstimate × quantity`; null when not estimable (FR-008) |
| `currency` | string \| null | native currency of `amountNative` |
| `amountUsd` | number \| null | via existing conversion (MEP for ARS); null when conversion unavailable — excluded from month totals |
| `estimated` | boolean | always `true` in v1 (all amounts are estimates) |
| `source` | `"position" \| "yahoo"` | provenance |

Ordering: ascending by `date`; overdue maturities first (most negative `daysUntil` first).

## DividendFacts (internal — provider output, input to builder)

| Field | Type | Notes |
|---|---|---|
| `symbol` | string | as looked up |
| `exDate` | ISO date \| null | `calendarEvents.exDividendDate` |
| `payDate` | ISO date \| null | `calendarEvents.dividendDate` |
| `perShareAnnualRate` | number \| null | `summaryDetail.dividendRate` |
| `perShareEstimate` | number \| null | `perShareAnnualRate / 4`; null ⇒ date-only events |

Provider contract (`IDividendEventsProvider.getUpcomingDividends(symbols: string[])`): resolves to `{ facts: DividendFacts[], failedSymbols: string[], sourceAvailable: boolean }`. Never rejects — total source failure sets `sourceAvailable: false` (drives FR-007's degraded notice).

## API response (`GET /api/calendar`)

```json
{
  "horizonDays": 180,
  "generatedAt": "2026-07-21T00:00:00Z",
  "dividendSourceAvailable": true,
  "fixedIncomeWithoutMaturity": 1,
  "events": [ CalendarEvent, ... ],
  "months": [
    { "month": "2026-08", "totalUsd": 123.45, "excludedFromTotal": 1, "eventCount": 4 }
  ]
}
```

- `months` implements FR-010 (subtotals + excluded count) — computed server-side so the page and any future MCP tool agree.
- `fixedIncomeWithoutMaturity` implements the "missing data is visible" edge case.

## Weekly-analysis prompt block (`## upcomingEvents`)

Compact JSON array, 28-day window, only when non-empty (FR-005): `[{ "type", "date", "daysUntil", "symbol", "broker", "amountUsd" }]` — trimmed field set to respect the token-diet lineage (011/015).

## Validation rules

- Maturity events derive only from open positions with a parseable `maturityDate` and `assetType ∈ {bond, bopreal, lecap, on, deposit}` (FR-001). Unparseable dates count into `fixedIncomeWithoutMaturity`, never throw.
- Dividend events only within the horizon and never in the past.
- Horizon: `days` query param, integer 1–400, default 180; analysis window fixed at 28 (constants, not settings — spec assumption).

## State transitions

None — stateless read model.
