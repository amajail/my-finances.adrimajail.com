# Data Model: Weekly analysis token-diet v2

**No data model change.** This feature alters only what is sent to the generation step (input
assembly) and the fixed preamble guidance; it adds no entity, field, table, or persisted column.

## Entities touched

- **Generation input** (transient, not persisted): the assembled user message. Two blocks shrink —
  `## previousAnalysis` loses its prior-macro sub-block; `## macroContext` omits unavailable
  indicators. Required continuity inputs (prior summary, prior open suggestions) are retained.
- **Generated narrative** (`WeeklyAnalysis.markdownBody`, existing field): becomes more concise; no
  shape change. All required sections remain.
- **Run telemetry** (`tokensIn`, `tokensOut`, `costUsd` on the analysis row, existing): unchanged in
  structure; used as the before/after measurement basis. Expected direction: `tokensOut`/`costUsd`
  decrease on the A/B comparison.

## Invariants

- No required narrative section (summary, market context, portfolio assessment, suggested actions,
  watchlist) is removed (hard gate).
- Persisted analysis schema and dashboard rendering are unchanged.
