# Tasks: Analysis Token Diet

**Input**: Design documents from `/specs/011-analysis-token-diet/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Backend prompt-assembly tests are updated in-place (Constitution Principle IV — this is exactly where a silent regression would hurt). No UI logic changes.

**Organization**: By user story. US1 (P1) = code-side token cuts (runtime behavior). US2 (P2) = document owner-only levers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task
- **[Story]**: US1 / US2 (Polish carries no story label)

## Shared-file note

T001–T003 all edit `_buildUserMessage` in `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` — **sequential, not parallel**. T004 (preamble), T005 (tool schema), and T008 (editing guide) are distinct files and parallelize with each other and with the `GenerateWeeklyAnalysis` edits.

---

## Phase 1: Setup

No project setup or new infrastructure. Measurement baseline already captured (pre-feature run 2026-06-13: **21,729 in / 7,962 out / $0.7463**) — used by the Polish verification.

---

## Phase 2: User Story 1 - Cheaper runs that lose no information (Priority: P1) 🎯 MVP

**Goal**: Reduce input and output tokens per run while keeping all six structured tables and a coherent narrative.

**Independent Test**: Run before/after against the same portfolio; recorded `tokensIn` and `tokensOut` both drop, all six structured sections still populated, narrative coherent and non-redundant with the tables.

### Input trims — `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` (`_buildUserMessage`)

- [X] T001 [US1] Compact-serialize every user-message block — replace `JSON.stringify(x, null, 2)` with `JSON.stringify(x)` for `currentHoldings`, `portfolioSummary`, `positionChanges`, `previousAnalysis`, and `macroContext` in `_buildUserMessage` (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`)
- [X] T002 [US1] Remove the `## portfolioTotals` block from the user message and emit a single `## mepRate` line (value + `mepRateAsOf`) in its place — the rest of `portfolioTotals` duplicates `portfolioSummary` (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`). Do NOT change `_totalsFromSummary` or persistence — `portfolioTotals` stays on the `WeeklyAnalysis` (FR-011)
- [X] T003 [US1] Strip `topPerformers`/`bottomPerformers` from the in-prompt `summaryForPrompt` (extend the existing reduction that already removes `positions`) in `_buildUserMessage` (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`). Do NOT change `PortfolioCalculator.summary()` — the dashboard still uses the performers (FR-011). Removal is unconditional with a documented revert (spec clarification Q2)

### Output trims

- [X] T004 [P] [US1] Add a concision directive to the fixed guardrail preamble (`src/application/use-cases/analysis/prompts/guardrail-preamble-v1.md`): keep `markdownBody` tight, interpret — don't restate — the supplied tables, prefer brevity; rationales one–two sentences. This is the only runtime-effective, code-owned narrative lever (FR-003, FR-007)
- [X] T005 [P] [US1] Tighten `orders[].rationale.maxLength` from 1000 to 400 (and nudge the description toward one–two sentences) in the runtime tool schema `specs/002-weekly-rebalance-analysis/contracts/submit-analysis-tool.json`, per `contracts/tool-schema-change.md` (FR-004). Leave `markdownBody` uncapped (FR-008) and all six feature-010 arrays unchanged (FR-005)

### Tests

- [X] T006 [US1] Update the prompt-assembly assertions in `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js`: the user message no longer contains a `## portfolioTotals` block, now contains a `## mepRate` line, the summary block no longer contains `topPerformers`/`bottomPerformers`, and blocks are compact (no 2-space-indented JSON). Add/adjust as needed; keep the existing structural assertions green (depends on T001–T003)

**Checkpoint**: US1 complete — fewer tokens both sides, tables intact, narrative coherent.

---

## Phase 3: User Story 2 - See and pull the cost levers I control (Priority: P2)

**Goal**: Make the owner-only cost levers discoverable where the owner already works.

**Independent Test**: Open the `/instructions` editing guide; confirm it explains trimming the active instructions body and switching `analysis.model` (with the quality/cost tradeoff).

- [X] T007 [US2] Add a "Saving tokens" section to `src/application/use-cases/analysis/prompts/editing-guide-v1.md` (shown read-only in the `/instructions` editor by feature 010): (a) the editable instructions body is the largest variable per-run contributor — trim prose that restates the now-tabular sections or asks for long multi-section narratives; (b) `analysis.model` — a cheaper tier (e.g. `claude-sonnet-4-6`) is ~5× cheaper in/out, a quality tradeoff, switchable without code; default stays Opus; (c) mention `analysis.maxOutputTokens` as a hard output ceiling. Generic/holdings-free (FR-010, FR-019 of feature 010)

**Checkpoint**: Owner can self-serve the two further levers (SC-006).

---

## Phase 4: Polish & Verification

- [X] T008 [P] Run the full Jest suite (`npm test`) and the dashboard build (`cd dashboard && npm run build`); fix any failures (no red on `main`, Principle IV)
- [ ] T009 Live before/after on the running func host: `node scripts/delete-analysis.local.js <date>` → `curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer -d '{}'` → compare `tokensIn`/`tokensOut`/`costUsd` of the new run to the baseline; confirm both lower, all six tables populated, narrative coherent (SC-001, SC-002, SC-003, SC-004, SC-005)
- [X] T010 [P] Privacy check before push: the diff only *reduces* prompt content and edits generic preamble/guide/schema text — confirm no real holdings/symbols/quantities/PPCs in committed files (Principle I)

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: none.
- **US1 (Phase 2)**: T001 → T002 → T003 are sequential (same method); T004 and T005 are [P] (distinct files), can land anytime in the phase; T006 (tests) after T001–T003.
- **US2 (Phase 3)**: independent of US1 (doc-only) — can be done in parallel with US1 if desired; placed after by priority.
- **Polish (Phase 4)**: after US1 (and US2 if included). T009 (live run) makes a real paid call — run once at the end.

## Parallel opportunities

- Within US1: **T004** (preamble) and **T005** (tool schema) run in parallel with the `GenerateWeeklyAnalysis` edits (T001–T003), since they touch different files.
- **T007** (US2 doc) is fully independent and can run any time.

```bash
# Representative parallel batch (distinct files):
Task: "T004 concision directive in guardrail-preamble-v1.md"
Task: "T005 rationale maxLength 1000→400 in submit-analysis-tool.json"
Task: "T007 Saving-tokens section in editing-guide-v1.md"
```

## Implementation strategy

### MVP (US1 only)
Phase 2 alone delivers the token reduction (the whole runtime point). Verify with the live before/after (T009) and ship.

### Incremental
US1 (code cuts) → US2 (owner-lever docs) → Polish. US2 is doc-only and low-risk; bundle it unless you want US1 isolated for a fast measurement.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- No new dependencies, tables, entities, or storage; persistence + dashboard unchanged.
- Commit after each logical group (speckit work → commits authorized).
- T009 is the one paid step — a real Anthropic run; everything else is free/offline.
