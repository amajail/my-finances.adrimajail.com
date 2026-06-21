# Research: Weekly analysis token-diet v2

Technical context resolved during specify + clarify; no open NEEDS CLARIFICATION.
Decisions and the existing-code grounding behind them.

## Decision 0 — Where the cost actually is: output, not input

- **Finding**: On a representative recent run, input ≈ 17.7K tokens and output ≈ 6.1K tokens, but
  output is ~5× the per-token price of input, so output drives the majority of run cost. Feature
  011 already compacted input (compact JSON, removed duplicate aggregate blocks and performer
  lists). The largest remaining lever is therefore the **output**.
- **Implication**: prioritize narrative concision (interpret-not-restate) over further input cuts.
- **Code grounding**: per-run telemetry (`tokensIn`, `tokensOut`, `costUsd`) is recorded on the
  analysis row; model/price config in the Anthropic client. Feature 011 changes in
  `specs/011-analysis-token-diet/` (compact JSON, dropped `portfolioTotals`, stripped performers,
  added an initial concision directive, tightened `orders[].rationale` maxLength).

## Decision 1 — Output lever: interpret, don't restate the deterministic tables

- **Decision**: Strengthen the fixed `guardrail-preamble-v1.md` rule so `markdownBody` interprets
  and references the deterministically computed tables (drift, concentration caps, position changes,
  macro week-over-week, duplications) rather than reproducing their rows. Required narrative
  sections stay (summary, market context, assessment, suggested actions, watchlist) — FR-002.
- **Rationale**: feature 010 moved tabular detail into rendered tables and 012/013/014 add more
  deterministic sections; the narrative re-tabulating them is pure output waste. The preamble is the
  ONLY code-controlled part of the runtime system prompt (the editable instructions body is the
  owner's), so the rule applies every run regardless of owner edits.
- **Alternatives rejected**: a hard `markdownBody` length cap — would fail valid runs (spec FR/SC
  forbid dropping required content); editing the owner's instructions body — not code's to change.

## Decision 2 — Input lever: drop the redundant prior-macro panel

- **Decision**: Remove the prior-period macro readings sub-block from the `## previousAnalysis`
  input in `_buildUserMessage`, keeping prior summary + prior open suggestions for continuity.
- **Rationale**: feature 012's deterministic macro week-over-week comparison already expresses the
  prior→current macro deltas, so sending the raw prior-macro panel duplicates it (spec FR-003).
  Where 012's comparison is absent (first run), the trim simply does not apply.
- **Code grounding**: `## previousAnalysis` block assembled in
  `GenerateWeeklyAnalysis._buildUserMessage` (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:~531-536`).

## Decision 3 — Input lever: omit unavailable indicators

- **Decision**: In the `## macroContext` block, omit indicators whose reading is unavailable instead
  of sending `{value:null, available:false}` placeholders.
- **Rationale**: placeholder entries carry no signal and cost tokens (spec FR-004). When all
  indicators are available, this is a no-op.
- **Code grounding**: `## macroContext` block in `_buildUserMessage` (`:~537-542`); each indicator
  has `value`/`asOf`/`available`.

## Decision 4 — Measurement: A/B on identical captured inputs

- **Decision**: Prove SC-001/SC-002 by capturing one run's exact inputs and generating under the old
  vs new guidance, comparing recorded `tokensOut`/`costUsd`. 15% is the directional target; the hard
  gate is "measurable drop with all required sections present" (clarify 2026-06-21).
- **Rationale**: weekly portfolio/market variance would otherwise swamp the signal; A/B on identical
  inputs isolates this change's effect.
- **Code grounding**: telemetry already persisted per run; no new instrumentation needed.

## Note — caching is not a usable lever here

The runtime already marks the system prompt with ephemeral (5-minute) prompt caching, but the
weekly cadence means the cache never hits across runs. No caching change is proposed; it would not
reduce real weekly cost.
