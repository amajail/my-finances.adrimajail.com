# Contract — `submit_analysis` tool-schema additions (feature 010)

Extends the existing `submit_analysis` tool (`src/application/use-cases/analysis/prompts/submit-analysis-tool.json`).
Only the **LLM-emitted** sections are added here. The code-computed sections
(bucket drift, asset-class drift, concentration caps) are NOT in the tool schema
— they are computed by `AllocationDriftCalculator` and attached server-side.

## Added properties (all OPTIONAL — not in `required`)

Optional so the model omits a section when there is nothing to report
(→ absent = section omitted, FR-008). Existing `required: ["summary",
"markdownBody", "orders"]` is unchanged.

```jsonc
{
  "watchlist": {
    "type": "array",
    "maxItems": 50,
    "description": "Rule-triggered flags. Each item is something a standing rule or condition surfaced this week. Omit the field entirely if nothing is flagged. Do NOT restate the code-computed drift or concentration-cap tables here — they are supplied separately and rendered for you.",
    "items": {
      "type": "object",
      "required": ["item", "trigger"],
      "additionalProperties": false,
      "properties": {
        "item":     { "type": "string", "minLength": 1, "maxLength": 120, "description": "The flagged holding or topic." },
        "trigger":  { "type": "string", "minLength": 3, "maxLength": 400, "description": "The rule or condition that fired (e.g. 'riesgo país > 600 bp', 'sector concentration directive')." },
        "severity": { "type": "string", "enum": ["info", "warn", "alert"], "description": "Optional severity." }
      }
    }
  },

  "weekOverWeek": {
    "type": "array",
    "maxItems": 50,
    "description": "ANALYTICAL changes since last week — metrics/assessments, NOT raw position quantity changes (those are computed and shown separately). Omit if first run or nothing material changed.",
    "items": {
      "type": "object",
      "required": ["metric", "prior", "current", "direction"],
      "additionalProperties": false,
      "properties": {
        "metric":    { "type": "string", "minLength": 1, "maxLength": 120 },
        "prior":     { "type": "string", "minLength": 1, "maxLength": 120, "description": "Prior value as a short string (allows %, words, or numbers)." },
        "current":   { "type": "string", "minLength": 1, "maxLength": 120 },
        "direction": { "type": "string", "enum": ["up", "down", "flat"] }
      }
    }
  },

  "frameworkAmendments": {
    "type": "array",
    "maxItems": 25,
    "description": "Suggested changes to the strategic framework, if any. Omit if none. These are suggestions for the owner to consider — they are not applied automatically.",
    "items": {
      "type": "object",
      "required": ["proposal", "rationale"],
      "additionalProperties": false,
      "properties": {
        "proposal":  { "type": "string", "minLength": 5, "maxLength": 500 },
        "rationale": { "type": "string", "minLength": 5, "maxLength": 800 }
      }
    }
  }
}
```

## Validation behavior

- The model's tool output is validated against the schema by the existing LLM
  client. A malformed/extra field fails the run with `LLMSchemaValidationError`,
  persisted as a clean **failed** analysis (no corrupted data) —
  `GenerateWeeklyAnalysis.js:237`.
- `summary`, `markdownBody`, `orders` semantics unchanged. `markdownBody` should
  no longer restate the tabular sections (FR-009; enforced by the trimmed base
  template + guardrail preamble).
