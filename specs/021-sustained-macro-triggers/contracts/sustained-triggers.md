# Contract: sustained triggers

Two surfaces change, both additive. Placeholders only; no real figures.

## 1. Model input: `## sustainedTriggers` block

Placed directly after `## macroContext` in the user message. Omitted only when `macroContext` itself is unavailable.

````text
## sustainedTriggers
Code-computed duration of each "sustained" framework trigger, ending at the current reading. Report a trigger FIRED only when `durationMet` is true. Do not estimate duration yourself. If `includesUnknown` is true say part of the span rests on weeks with unavailable data; if `historyLimited` is true say the count is a lower bound.
```json
[
  {"key":"riesgoPais","current":123.4,"asOf":"2026-01-02","condition":"> 800 bp for 30d","status":"building","heldDays":14,"daysRemaining":16,"durationMet":false,"includesUnknown":false,"historyLimited":false},
  {"key":"bcraReserves","current":123.4,"asOf":"2026-01-02","condition":"< 0 USD M (net) for 30d","status":"not-evaluable","heldDays":0,"durationMet":false,"note":"reading basis is gross; net required"}
]
```
````

Rules:

- Compact JSON, one row per defined trigger, in the fixed definition order.
- `current` and `asOf` are `null` when the reading is unavailable.
- No holdings, quantities or prices appear in this block.

## 2. Guardrail rule (appended to `guardrail-preamble-v2.md`)

> 5. **Respect `sustainedTriggers`.** Each row gives the code-computed number of days a macro condition has held. Report a "sustained" trigger as FIRED only when `durationMet` is true. A row with another status is NOT FIRED, whatever the current reading looks like; for `building` say how many days remain. When `durationMet` is true, treat the trigger as FIRED and apply the action the framework prescribes for it in your orders and narrative. Never infer a duration from the current reading or the week-over-week table.

## 3. Read surfaces

`GET /api/analysis/weekly/{date}` and the MCP tool `get_weekly_analysis` gain one field on the analysis object:

| Field | Type | Meaning |
|---|---|---|
| `sustainedTriggers` | array \| `null` | The persisted `SustainedTriggerResult` rows (see `data-model.md`); `null` on rows created before this feature |

No field is removed or renamed. The LLM client interface and the `submit_analysis` tool schema are unchanged.
