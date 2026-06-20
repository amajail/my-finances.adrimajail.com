# Data Model — Analysis Token Diet (feature 011)

This feature changes **what is sent to the model**, not what is stored. There are **no new persisted entities, columns, or settings**, and no schema migrations.

## Persistence: unchanged

- `WeeklyAnalysis` keeps all existing fields, including `portfolioTotals` (feature 006) and the six feature-010 structured sections. They are still computed, persisted, and rendered.
- The telemetry fields `tokensIn`, `tokensOut`, `costUsd` are unchanged — they are the **measurement basis** for SC-001/SC-002 (before/after comparison).

## Model-input payload: shape after the trim

The user message assembled in `_buildUserMessage` changes as follows (all blocks compact-serialized, not pretty-printed):

| Block | Before | After |
|---|---|---|
| `currentHoldings` | pretty JSON | compact JSON (unchanged fields) |
| `portfolioSummary` | pretty JSON incl. `topPerformers`/`bottomPerformers` | compact JSON, **performers stripped** |
| `portfolioTotals` | full pretty-JSON block | **removed**; replaced by a one-line `## mepRate` (value + asOf) |
| `positionChanges` | pretty JSON | compact JSON |
| `previousAnalysis` | pretty JSON | compact JSON |
| `macroContext` | pretty JSON | compact JSON |

- No field the analysis decisions rely on is removed (FR-001): holdings, totals (via `portfolioSummary`), MEP rate (one-liner), week-over-week changes, and macro context all remain.
- `PortfolioCalculator.summary()` is **not** changed — the dashboard still gets `topPerformers`/`bottomPerformers`; they are stripped only from the in-prompt copy (mirrors how `positions` is already stripped).

## System prompt: shape after the trim

- Effective prompt remains `guardrail preamble ⊕ owner instructions body` (feature 010, unchanged structure).
- The **preamble** gains one concision rule (output lever). The owner body is untouched by code.

## Tool schema (output contract): one change

- `submit_analysis` → `orders[].rationale.maxLength`: **1000 → 400**. No fields added or removed; all six feature-010 arrays unchanged (FR-005). See `contracts/tool-schema-change.md`.

## Owner-facing documentation (no data)

- `editing-guide-v1.md` (shown read-only in the `/instructions` editor) gains a "saving tokens" section covering the two owner levers (trim the body; `analysis.model` tier). This is text, not data.
