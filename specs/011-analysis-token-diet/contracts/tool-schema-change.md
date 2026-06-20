# Contract change — `submit_analysis` tool schema (feature 011)

File: `specs/002-weekly-rebalance-analysis/contracts/submit-analysis-tool.json` (this is the file `GenerateWeeklyAnalysis` loads at runtime).

## Single change: tighten the order rationale cap

`input_schema.properties.orders.items.properties.rationale.maxLength`: **1000 → 400**.

```jsonc
"rationale": {
  "type": "string",
  "minLength": 20,
  "maxLength": 400,   // was 1000
  "description": "Justification citing at least one of: allocation drift, a standing position-level directive, an active trigger condition, or new market context. ARS-denominated orders must acknowledge commission + IVA. Keep it to one or two sentences."
}
```

- 400 chars (~2–3 sentences) is ample for a clear justification; it reduces output on multi-order weeks.
- No fields are added or removed. The feature-010 arrays (`watchlist`, `weekOverWeek`, `frameworkAmendments`) and all other constraints are unchanged (FR-005).

## Validation impact

- The model's tool output is validated against this schema; a rationale over 400 chars would now fail validation → the existing `LLMSchemaValidationError` path records a clean failed run rather than corrupting data. Risk is low (400 is generous and the concision directive steers the model below it), and it does **not** affect the unbounded `markdownBody` (no hard narrative cap — FR-008).

## NOT changed

- No `markdownBody` `maxLength` is introduced (FR-008).
- No change to required fields, enums, or any other length bound.
