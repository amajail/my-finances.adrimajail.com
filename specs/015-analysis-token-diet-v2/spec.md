# Feature Specification: Weekly analysis token-diet v2

**Feature Branch**: `015-analysis-token-diet-v2`

**Created**: 2026-06-21

**Status**: Draft

**Input**: User description: "Reduce the per-run token cost of the weekly analysis beyond the first token-diet pass, focusing on the part that now dominates cost (the generated narrative / output) and on input that has become redundant now that more sections are computed deterministically — without losing any information the owner actually reads."

## Clarifications

### Session 2026-06-21

- Q: Is the ≥15% output-reduction target a hard acceptance gate or a directional goal? → A: Directional aim; the hard acceptance gate is "output measurably drops AND all required narrative sections remain present." The 15% is a target, not a blocking threshold (output volume varies with market conditions).
- Q: How is the output-token reduction measured for acceptance? → A: Deterministic A/B on identical captured inputs — generate one run's exact inputs under the old vs new guidance and compare recorded token/cost telemetry, isolating the change from week-to-week variance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cheaper runs without losing readable content (Priority: P1)

The portfolio owner wants each weekly analysis to cost less to generate while still containing
every piece of information they rely on. The generated narrative currently re-states tables
that are already computed deterministically and rendered separately, which inflates the
expensive output. The narrative should interpret those tables rather than reproduce them.

**Why this priority**: Output is the single largest cost driver of a run; cutting redundant
narrative is the highest-leverage saving and directly reduces cost per run.

**Independent Test**: Generate an analysis before and after the change for the same portfolio
and macro inputs; confirm measured output volume (and cost) drops while the summary, market
read, assessment, suggested actions, and watchlist are all still present and coherent.

**Acceptance Scenarios**:

1. **Given** a portfolio and macro inputs that produce deterministic tables (allocation drift,
   position changes, and any other code-computed sections), **When** the analysis is generated,
   **Then** the narrative interprets/references those tables rather than reproducing their rows,
   and the recorded output token count is lower than the pre-change baseline for equivalent input.
2. **Given** the same inputs, **When** the analysis is generated, **Then** the executive summary,
   market context, portfolio assessment, suggested actions, and watchlist remain present and
   informative (no required section is dropped).
3. **Given** the change is shipped, **When** a run completes, **Then** the per-run token and cost
   telemetry is still recorded so before/after savings are measurable.

---

### User Story 2 - Stop sending input that is now redundant (Priority: P2)

Some input handed to the generation step duplicates information that is now produced
deterministically (for example, prior-period macro readings that are already expressed as a
computed change set), or sends placeholder entries for unavailable indicators. This redundant
input should be trimmed.

**Why this priority**: Input savings are real but smaller than output; still worth taking once
the deterministic sections make the duplication safe to remove.

**Independent Test**: Generate an analysis and confirm the redundant prior-macro duplication and
unavailable-indicator placeholders are no longer part of the input payload, while the narrative
quality and continuity (references to last week, open suggestions) are unchanged.

**Acceptance Scenarios**:

1. **Given** the deterministic period-over-period comparison is available, **When** the input is
   assembled, **Then** the prior-period readings that the comparison already captures are not also
   sent as duplicate raw input.
2. **Given** one or more indicators are unavailable for the period, **When** the input is
   assembled, **Then** unavailable indicators are omitted rather than sent as empty placeholders.
3. **Given** these input trims, **When** the analysis is generated, **Then** week-over-week
   continuity (prior summary, open suggestions, prior macro trend) is preserved in the output.

---

### Edge Cases

- **First-ever run / no prior analysis**: no period-over-period comparison exists; input trims
  that depend on it simply do not apply, and the run still succeeds.
- **A run where the model would otherwise restate a large table**: the narrative must still be
  allowed to *reference and interpret* the data (e.g. call out the biggest drift), just not
  re-tabulate it; content the owner reads is preserved.
- **Quality regression risk**: if trimming guidance caused the narrative to omit required
  sections, that is a failure (Story 1, scenario 2 guards this).
- **All indicators available**: input is unchanged by the unavailable-indicator trim (no-op).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The generation guidance MUST instruct the narrative to interpret and reference the
  deterministically computed tables (allocation drift, concentration caps, position changes, and
  any other code-computed sections) rather than reproduce their rows.
- **FR-002**: The system MUST NOT drop any required narrative section (executive summary, market
  context, portfolio assessment, suggested actions, watchlist) as a result of this change.
- **FR-003**: The system MUST omit, from the generation input, prior-period readings that are
  already represented by a deterministic period-over-period comparison, while preserving the
  remaining week-over-week continuity inputs (prior summary, prior open suggestions).
- **FR-004**: The system MUST omit unavailable indicators from the generation input rather than
  sending empty placeholder entries for them.
- **FR-005**: The system MUST continue to record per-run token usage and cost so the reduction is
  measurable against a baseline.
- **FR-006**: The change MUST preserve correctness of all deterministic sections and persistence
  (no change to what is stored or shown beyond the narrative becoming more concise).
- **FR-007**: The feature MUST NOT change the default generation model, introduce a new data
  source, add a table, or alter persisted schema.

### Key Entities *(include if feature involves data)*

- **Generation input**: the assembled set of portfolio, macro, prior-analysis, and instruction
  material handed to the generation step. This feature removes redundant portions of it.
- **Generated narrative (output)**: the prose portion of the analysis. This feature makes it more
  concise by deferring tabular detail to the deterministic sections.
- **Run telemetry**: per-run input/output token counts and cost, used to measure savings; unchanged
  in structure, retained for before/after comparison.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Measured by deterministic A/B on identical captured inputs (same inputs generated
  under old vs new guidance), the recorded output token count decreases. The hard acceptance gate
  is a measurable decrease with all required sections preserved (SC-003); a ≥ 15% reduction is the
  directional target, not a blocking threshold.
- **SC-002**: In the same A/B comparison, total recorded cost per run decreases versus the
  pre-change measurement on identical inputs.
- **SC-003**: 100% of required narrative sections (summary, market context, assessment, suggested
  actions, watchlist) remain present in post-change runs.
- **SC-004**: Redundant prior-period macro input is no longer present in the generation payload
  (0 duplicate prior-readings sent when a deterministic comparison exists).
- **SC-005**: Unavailable indicators contribute 0 placeholder entries to the generation input.
- **SC-006**: Week-over-week continuity in the output (reference to prior summary and open
  suggestions) is preserved in 100% of runs that have a prior analysis.
- **SC-007**: Per-run token/cost telemetry remains populated for 100% of completed runs.

## Assumptions

- "Required sections" are the narrative sections the owner currently relies on: executive summary,
  market context, portfolio assessment, suggested actions, and watchlist. Period-over-period
  *tabular* detail is considered satisfied by the deterministic sections and need not be repeated
  in prose.
- A deterministic period-over-period comparison (the macro week-over-week computation) is assumed
  available; where it is not (first run), the dependent input trim simply does not apply.
- The default generation model stays as-is. Choosing a cheaper model tier is a separate
  owner-configurable lever and is explicitly out of scope for this feature (it would trade quality
  for cost and is the owner's decision, not a code default change).
- This feature builds on the prior token-diet pass (which already compacted serialization, removed
  duplicated aggregate blocks, and added an initial concision directive); it does not re-do that
  work but extends it where deterministic sections now make further trimming safe.
- Savings are directional and measured from recorded telemetry on representative runs, not
  guaranteed to a fixed number, because output length depends on portfolio/market conditions.
