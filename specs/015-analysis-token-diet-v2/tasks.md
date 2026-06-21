---
description: "Task list for feature 015 — weekly analysis token-diet v2"
---

# Tasks: Weekly analysis token-diet v2

**Input**: Design documents from `/specs/015-analysis-token-diet-v2/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md (no-change), contracts/prompt-changes.md

**Tests**: Included — unit tests for the input-assembly trims are requested by the spec.

**Sequencing**: Best implemented after 012/013/014 merge so the "interpret not restate" preamble
rule references deterministic sections present on `main` (plan Dependency note). Degrades to a
no-op where a section is absent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1 (output) / US2 (input trims)

---

## Phase 1: Setup

- [ ] T001 Capture an A/B baseline: pick a recent stored analysis date, record its
  `tokensIn`/`tokensOut`/`costUsd` from `GET /api/analysis/weekly/{date}` as the pre-change baseline
  for SC-001/SC-002 (note it in the PR description, no real holdings values).

---

## Phase 2: Foundational

_None — backend-only change confined to prompt assembly + the fixed preamble; no blocking infra._

**Checkpoint**: proceed directly to user stories.

---

## Phase 3: User Story 1 — Cheaper runs without losing content (Priority: P1) 🎯 MVP

**Goal**: Narrative interprets/references the deterministic tables instead of reproducing them, so
output tokens drop while every required section remains.

**Independent Test**: A/B the same captured inputs on old vs new preamble; output tokens drop and
all required sections present.

### Implementation

- [ ] T002 [US1] Strengthen the interpret-not-restate rule in the fixed `guardrail-preamble-v1.md`
  (the code-controlled runtime system-prompt part): the `markdownBody` must INTERPRET and REFERENCE
  the supplied deterministic tables (drift, concentration caps, position changes, macro
  week-over-week, duplicate holdings, administrative positions) and MUST NOT reproduce their rows;
  required sections (executive summary, market context, portfolio assessment, suggested actions,
  watchlist) MUST be kept. (per contracts/prompt-changes.md)
- [ ] T003 [US1] Manual content check on a post-change run: confirm the five required sections are
  present and the narrative no longer re-tabulates the deterministic sections (FR-002, SC-003).

**Checkpoint**: US1 delivers the main output saving on its own.

---

## Phase 4: User Story 2 — Stop sending redundant input (Priority: P2)

**Goal**: Remove the prior-macro panel from `## previousAnalysis` and omit unavailable indicators
from `## macroContext`, preserving continuity inputs.

**Independent Test**: Generated input no longer contains the prior-macro duplication or
unavailable-indicator placeholders; prior summary + open suggestions still present.

### Tests for User Story 2 ⚠️ (write first, ensure they fail)

- [ ] T004 [P] [US2] Unit test: `_buildUserMessage` `## previousAnalysis` block omits the
  prior-macro panel when a prior analysis exists, but retains prior summary + open suggestions
  (SC-004, SC-006), in `tests/unit/.../GenerateWeeklyAnalysis.input.test.js`.
- [ ] T005 [P] [US2] Unit test: `_buildUserMessage` `## macroContext` block omits indicators with
  `available === false` and is unchanged when all are available (SC-005).

### Implementation

- [ ] T006 [US2] In `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` `_buildUserMessage`,
  drop the prior-macro sub-block from `## previousAnalysis` (keep summary + open suggestions);
  guard so first-run / no-prior is a no-op (FR-003).
- [ ] T007 [US2] In the same `_buildUserMessage`, omit unavailable indicators from `## macroContext`
  (FR-004). Make T004/T005 pass.

**Checkpoint**: US1 + US2 both in; input + output both trimmed.

---

## Phase 5: Polish & Measurement

- [ ] T008 A/B measurement (SC-001/SC-002): generate the captured baseline inputs under the
  post-change code; compare `tokensOut`/`costUsd` to T001 baseline; confirm a measurable decrease
  (directional ≥15%) with all required sections present. Record the delta in the PR (no real values).
- [ ] T009 Run `specs/015-analysis-token-diet-v2/quickstart.md` acceptance checks end-to-end.
- [ ] T010 Privacy self-review of the diff (preamble text + any test fixtures use placeholders only).

---

## Dependencies & Execution Order

- T001 (baseline) before T008 (measurement).
- US1 (T002–T003) is independent of US2 and can ship alone (MVP).
- US2 tests (T004, T005) before US2 implementation (T006, T007).
- T006 and T007 touch the same method `_buildUserMessage` → sequential (not [P]).
- Polish (T008–T010) after the desired user stories.

## Notes

- No persisted schema/data/model change; default model unchanged.
- Output-length guidance is verified by A/B + content check, not a brittle length assertion.
- Commit after each logical group; conventional `feat:`/`test:`/`docs:` prefixes.
