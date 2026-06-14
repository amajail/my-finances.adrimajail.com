# Research — Analysis Token Diet (feature 011)

Phase 0. The spec's decisions were front-loaded; this records *why each trim is safe* and the *measurement method*. No `NEEDS CLARIFICATION` remain.

---

## R1 — Where the code levers actually are (the pivotal fact)

**Finding**: `GenerateWeeklyAnalysis` builds the system prompt as `buildSystemPrompt(activeInstructionsBody)` = fixed guardrail preamble ⊕ the owner-edited `analysis.instructionsV1` body. The only file it `require`s for the prompt is the **tool schema** (`GenerateWeeklyAnalysis.js:35`). The seed template `weekly-rebalance-v1.md` is **not loaded at runtime** (feature 005).

**Consequence**: The code can influence the run only through (a) the **guardrail preamble** (`guardrail-preamble-v1.md`, prepended every run) and (b) the **tool schema**. The largest single contributor — the editable instructions body — is owner-only and therefore handled by documentation (FR-010), not code.

---

## R2 — Input trims (each safe; in `_buildUserMessage`)

**Decision**:
1. **Compact JSON** — replace `JSON.stringify(x, null, 2)` with `JSON.stringify(x)` for every block (currentHoldings, portfolioSummary, positionChanges, previousAnalysis, macroContext). ~15–20% off input.
2. **Drop the `portfolioTotals` block** — its fields duplicate `portfolioSummary` (`totalByCurrency`, `grandTotalUsd`, `unrealizedPnlByCurrency`, `costBasisByCurrency`); the only unique datum is `mepRate`/`mepRateAsOf`, re-emitted as a single `## mepRate` line.
3. **Strip `topPerformers`/`bottomPerformers`** from the prompt's `summaryForPrompt` (extend the existing `positions`-stripping reduction). Derivable from `currentHoldings`. Removed unconditionally with a documented revert (clarification Q2).

**Rationale**: No decision-relevant figure is lost (holdings, totals, MEP, changes, macro all remain). Pretty-print whitespace and duplicated/derivable content are pure overhead.

**Alternatives considered**: keeping pretty-print (rejected — free ~20%); summarizing holdings by bucket instead of listing (rejected — loses per-position grounding the model relies on, higher risk).

---

## R3 — Output trims (the expensive side)

**Decision**:
1. **Concision directive in the guardrail preamble** — add a rule: keep `markdownBody` tight, interpret don't restate the supplied tables, prefer brevity; rationales one–two sentences. Runtime-effective on every run regardless of the owner body.
2. **Tighten `orders[].rationale` maxLength 1000 → 400** in the tool schema (`submit-analysis-tool.json:55`). Still ample for a clear justification; cuts output on multi-order weeks.

**Rationale**: Output is ~5× input price, so this is the highest-value lever the code controls. Both nudge the model toward brevity without removing any required field.

**Alternatives considered**: a hard `markdownBody` maxLength (rejected per FR-008 — would fail otherwise-valid runs); lowering `analysis.maxOutputTokens` default (rejected — caps by truncation, risks failed/partial tool calls); changing the default model (rejected per FR-009).

---

## R4 — Owner-controlled levers (documentation, FR-010)

**Decision**: Document the two owner-only levers where the owner will see them:
- **Editing guide** (`editing-guide-v1.md`, already shown read-only in the `/instructions` editor by feature 010) gains a short "saving tokens" section: trim verbose/duplicative prose from the active body (largest variable contributor), and the `analysis.model` setting — a cheaper tier (e.g. Sonnet) is ~5× cheaper in and out, a quality tradeoff, switchable without code; default stays Opus.
- **Quickstart** carries the dev/measurement angle + the performers revert.

**Rationale**: Reuses the feature-010 surface the owner already reads; no new UI. Keeps the biggest savings discoverable without changing defaults.

---

## R5 — Measurement method (how SC-001/SC-002 are verified)

**Decision**: Reuse the per-run telemetry already persisted on `WeeklyAnalysis` (`tokensIn`, `tokensOut`, `costUsd`). Baseline captured pre-feature: **21,729 in / 7,962 out / $0.7463** (2026-06-13 run). After the change, run again and compare; expect both counts lower with all six tables present and a coherent narrative.

**Caveat (informs the directional target, clarification Q1)**: holdings/macro change week to week, so a fresh run isn't a perfectly controlled before/after. The compact-JSON + dropped-blocks effect is deterministic input reduction (largely portfolio-size-independent), so input should reliably drop; output depends partly on model behavior under the concision directive. Hence ~25% is directional, not a gate.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Can code change the narrative length? | Only via the preamble (R1); body is owner-only → docs |
| Which input blocks are safe to cut? | pretty-print, portfolioTotals (keep MEP), performers (R2) |
| How to trim output without failing runs? | preamble concision + rationale cap; no hard cap (R3) |
| Where does owner guidance live? | editing-guide (dashboard-visible) + quickstart (R4) |
| How is success measured? | persisted telemetry vs. captured baseline; directional (R5) |

No `NEEDS CLARIFICATION` markers remain.
