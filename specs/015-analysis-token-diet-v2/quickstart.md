# Quickstart: Weekly analysis token-diet v2

## Prerequisites

- Functions host on `http://localhost:7071` (`npm start`); Azurite for tables.
- At least one prior stored analysis (so `previousAnalysis` continuity + the macro week-over-week
  comparison exist) — otherwise the prior-macro trim is a no-op.

## Build & test

```bash
npm test   # input-assembly trims: previousAnalysis without prior-macro; macroContext omits unavailable
```

## A/B measurement (acceptance — SC-001/SC-002)

The reduction is proven by generating the SAME inputs under old vs new guidance:

1. Capture a run's exact inputs (portfolio snapshot, macro, prior analysis) on the pre-change code.
2. Generate once on the pre-change code; record `tokensOut` / `costUsd`.
3. Generate once on the post-change code with the identical captured inputs; record `tokensOut` /
   `costUsd`.
4. Confirm output tokens and cost decreased (directional target ≥15%), and that every required
   section is present in the post-change `markdownBody`.

```bash
# inspect telemetry + sections for a generated date
curl -s http://localhost:7071/api/analysis/weekly/<date> \
  | jq '{tokensIn, tokensOut, costUsd, hasSummary: (.summary|length>0)}'
```

## Acceptance checks (maps to spec Success Criteria)

1. **SC-001/SC-002**: post-change `tokensOut`/`costUsd` lower than pre-change on identical inputs.
2. **SC-003**: post-change `markdownBody` still contains executive summary, market context,
   portfolio assessment, suggested actions, and watchlist.
3. **SC-004**: the generation input no longer contains the prior-macro panel when a deterministic
   macro week-over-week comparison exists.
4. **SC-005**: unavailable indicators contribute no placeholder entries to `## macroContext`.
5. **SC-006**: output still references prior summary + open suggestions (continuity preserved).
6. **SC-007**: per-run token/cost telemetry remains populated.

## Out of scope

Switching the model tier (`analysis.model`) is the largest single cost lever but is an
owner-configurable decision (quality tradeoff), not changed here.

## Rollback

Revert the branch; preamble text and input-assembly revert with it. No data migration.
