# Contract: prompt-assembly + preamble changes

No API contract change (no endpoint, request, or response shape change). This documents the
internal "contract" of the generation input and the fixed preamble, which this feature modifies.

## Output guidance (fixed preamble) — strengthened

The fixed guardrail preamble gains/sharpens a rule of the form:

> The supplied tables (allocation drift, concentration caps, position changes, macro
> week-over-week, duplicate holdings, administrative positions) are computed deterministically and
> rendered separately. In `markdownBody`, INTERPRET and REFERENCE them — call out what matters —
> but do NOT reproduce their rows. Keep all required sections (executive summary, market context,
> portfolio assessment, suggested actions, watchlist).

## Input block changes (`_buildUserMessage`)

### `## previousAnalysis` (trimmed)

Before (illustrative):

```jsonc
{ "summary": "...", "orders": [ /* with status */ ], "macro": { /* prior macro panel */ } }
```

After:

```jsonc
{ "summary": "...", "orders": [ /* with status */ ] }   // prior macro panel removed
```

- Removed only when a deterministic macro week-over-week comparison exists; otherwise unchanged.

### `## macroContext` (trimmed)

- Indicators with `available === false` are omitted entirely rather than emitted as
  `{ "value": null, "available": false }`. When all are available, output is identical.

## Measurement contract

- SC-001/SC-002 verified by A/B on identical captured inputs comparing recorded `tokensOut` and
  `costUsd`. No new telemetry fields.

All illustrative payloads use placeholders only — never real holdings/values.
