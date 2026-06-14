# Feature Specification: Analysis Token Diet

**Feature Branch**: `011-analysis-token-diet`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Reduce token usage (and cost) of the weekly rebalance analysis without losing analytical quality — trim prompt inputs, trim the model's output, and document the owner-controlled cost levers, while keeping the current high-quality model as the default."

## Context

Each weekly rebalance analysis makes a paid call to a third-party AI model. A representative run costs ~$0.75 (≈22,000 input + ≈8,000 output tokens), and output is priced ~5× higher than input — so what the model *writes* dominates the bill. Feature 010 moved the analysis's tabular content (bucket/asset-class drift, concentration caps, watchlist, week-over-week deltas, framework amendments) into structured tables, so the prose narrative no longer needs to carry that detail and can be shortened without losing information.

This feature reduces tokens on three fronts: (1) trim what is sent to the model, (2) trim what the model is asked to write, and (3) make the remaining owner-controlled cost levers visible. It must not reduce the analytical content the owner relies on — every structured table must still be produced and the narrative must remain coherent.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cheaper runs that lose no information (Priority: P1)

As the portfolio owner, I want each weekly analysis to cost meaningfully fewer tokens while still producing all the same structured tables and a coherent narrative, so I spend less per run without losing any of the analysis I depend on.

**Why this priority**: This is the whole point of the feature and the only part that changes runtime behavior. It stands alone as a complete improvement.

**Independent Test**: Run an analysis before and after the change against the same portfolio; confirm recorded input and output tokens both drop materially, all six structured sections are still populated, and the narrative still reads coherently.

**Acceptance Scenarios**:

1. **Given** a portfolio and configuration unchanged from a prior run, **When** a new analysis runs after this feature, **Then** the recorded input tokens and output tokens are both lower than the comparable prior run.
2. **Given** that prior run produced drift, caps, watchlist, week-over-week, and amendment data, **When** the post-change run completes, **Then** the same structured sections are still populated (nothing is dropped to save tokens).
3. **Given** the post-change run, **When** the owner reads the narrative, **Then** it is coherent and does not merely restate the data already shown in the tables.

---

### User Story 2 - See and pull the cost levers I control (Priority: P2)

As the portfolio owner, I want clear guidance on the cost levers only I can change — how much the editable instructions contribute, and the model choice and its quality/cost tradeoff — so I can decide when to trade quality for cost.

**Why this priority**: The largest remaining savings (the editable instructions size and the model tier) are owner decisions, not code changes. Surfacing them turns a one-time code win into an ongoing capability, but it is guidance rather than runtime behavior, so it ranks below US1.

**Independent Test**: Open the documented guidance and confirm it explains how to trim the active instructions, and when/how to switch the model to a cheaper tier and what is given up.

**Acceptance Scenarios**:

1. **Given** the owner wants to cut cost further, **When** they consult the guidance, **Then** it explains that the editable instructions body is a major per-run contributor and how to trim it.
2. **Given** the owner is weighing model cost vs. quality, **When** they consult the guidance, **Then** it states the relative cost of the cheaper tier and the quality tradeoff, and how to switch — without the default changing on its own.

---

### Edge Cases

- **First run / no prior week**: the input already omits the prior-week comparison; token trimming must not break the first-run path.
- **Empty or sparse sections**: when a structured section has nothing to report it is already omitted; trimming must not turn an omitted section into an error.
- **A run that still needs a long narrative**: the output trim must encourage brevity, not impose a hard length limit that fails an otherwise-valid run.
- **Owner instructions reference a removed input**: if the editable instructions explicitly rely on a prompt block this feature removes (e.g., best/worst performers), that block's absence should be a documented, revertable trade — not a silent analytical regression.
- **Cheaper model selected**: switching the model tier must remain a configuration choice that takes effect without code changes and without breaking the run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The data sent to the model for each run MUST be reduced in size without removing any figure the analysis decisions depend on (current holdings, key portfolio totals, the currency-conversion rate, week-over-week position changes, and macro context MUST all remain available to the model).
- **FR-002**: Redundant or low-value content MUST be removed from the model input, specifically: duplicated totals already conveyed elsewhere, and supplementary best/worst-performer lists that are derivable from the holdings.
- **FR-003**: The model MUST be instructed to keep its written narrative concise and to not restate content that is already presented in the structured tables.
- **FR-004**: The length allowance for each suggested order's justification MUST be tightened to a level that still permits a clear, sufficient rationale, reducing output on multi-order weeks.
- **FR-005**: All six structured sections produced today (bucket drift, asset-class drift, concentration caps, watchlist, week-over-week deltas, framework amendments) MUST continue to be produced; none may be dropped as a token-saving measure.
- **FR-006**: The per-run token and cost telemetry already recorded on each analysis MUST remain accurate so before/after savings are measurable.
- **FR-007**: The output-trim instruction MUST be applied through the fixed, system-controlled portion of the prompt so it takes effect on every run regardless of the owner's editable instructions.
- **FR-008**: The token reductions MUST NOT impose a hard cap on narrative length that could cause an otherwise-valid run to fail; brevity is encouraged, not enforced by truncation.
- **FR-009**: The default model MUST remain the current high-quality model; no change to the default model tier is part of this feature.
- **FR-010**: Owner-controlled cost levers that cannot be changed in code MUST be documented: how the editable instructions size affects per-run cost and how to trim it, and how to switch the model to a cheaper tier (with its quality tradeoff).
- **FR-011**: Removing a prompt input MUST NOT change what is stored on the analysis record or what the dashboard displays; only what is sent to the model changes.

### Key Entities *(include if feature involves data)*

- **Analysis run telemetry**: the input-token, output-token, and cost figures already captured per run — the measurement basis for success here.
- **Model input payload**: the assembled set of data blocks sent to the model each run (holdings, totals, rate, changes, macro, prior-run context) — the target of the input trim.
- **Fixed prompt guardrails**: the system-controlled portion of the prompt that always applies — the carrier for the concision instruction.
- **Suggested order rationale**: the per-order justification text whose allowance is tightened.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A like-for-like run after this feature uses at least ~25% fewer total tokens than the comparable run before it (baseline reference: ≈22k input / ≈8k output).
- **SC-002**: Both input and output token counts decrease (neither side is left untouched).
- **SC-003**: 100% of the structured sections that the comparable prior run produced are still produced after the change.
- **SC-004**: The owner judges the post-change narrative coherent and non-redundant with the tables (no loss of usable analysis).
- **SC-005**: No run fails as a result of the token reductions (no truncation-induced failures across repeated runs).
- **SC-006**: The owner can, from the documented guidance alone, identify at least two further cost levers they control (instructions trim, model tier) and how to use each.

## Assumptions

- The structured tables introduced in feature 010 adequately cover the tabular detail, so shortening the prose narrative loses no information the owner needs.
- Compacting how input data is formatted (without removing fields) does not degrade the model's comprehension.
- A tightened order-rationale allowance still leaves room for a clear justification.
- The editable instructions body is the largest variable contributor to per-run tokens and is owner-owned; the largest narrative savings therefore require an owner edit and are out of code scope (covered by documentation).
- Switching to a cheaper model tier is already a configuration setting; this feature documents but does not change it.
- "~25% fewer tokens" is the code-only target with the high-quality model retained; deeper cuts (instructions trim, cheaper model) are available to the owner on top.

## Dependencies

- Builds on **feature 010** (structured analysis tables) — the prose-to-table migration is what makes shortening the narrative safe.
