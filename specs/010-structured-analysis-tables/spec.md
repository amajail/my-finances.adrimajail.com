# Feature Specification: Structured Analysis Tables

**Feature Branch**: `010-structured-analysis-tables`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "Render the weekly rebalance analysis tabular sections as structured tables/cards instead of a markdown wall (hybrid structured — option B)."

## Context

The weekly rebalance analysis (feature 002) produces a rich report that currently arrives as a single long markdown narrative (`markdownBody`) and renders as one prose block on the analysis detail page. Several sections of that report are inherently tabular — they are lists of rows with consistent columns — yet today they are buried in prose, hard to scan, and (because the dashboard has no markdown-table styling) any tables the model emits render unstyled.

A prior set of feature sections already render as proper structured UI and MUST NOT be reworked here: the macro context panel, portfolio totals, week-over-week *position* changes (feature 006), and suggested orders with their execution controls (feature 007).

This feature targets the sections still trapped in prose and surfaces them as first-class structured tables/cards, while keeping a trimmed narrative for genuinely prose-shaped commentary (executive summary, market interpretation, reasoning).

## Clarifications

### Session 2026-06-13

- Q: Where should the structured rows come from, given none are computed in code today (the LLM only narrates them)? → A: **Hybrid** — the deterministic numeric sections (bucket drift, asset-class drift, concentration caps) are computed in code from current holdings + machine-readable framework targets; the judgment sections (watchlist, week-over-week analytical deltas, framework-amendment suggestions) are emitted by the LLM via the analysis tool.
- Q: How should the trimmed narrative avoid repeating rows promoted to tables (FR-009)? → A: Update the editable analysis instructions/metaprompt (feature 005) so the model stops emitting those sections in prose and writes a genuinely trimmed narrative.
- Q: When is a bucket/asset-class drift row flagged over- vs under-weight (FR-005)? → A: By the sign of the drift — positive = over-weight, negative = under-weight, zero = on-target (no tolerance band).
- Q: What is a "capped entity" in the concentration-caps table (FR-006)? → A: Entity-agnostic — render whatever cap rows the framework defines (single-name, issuer, bucket, asset class, …), each carrying a label identifying what it caps.
- Q: Should this feature add instruction-editing guardrails (given the editable instructions now also drive the trimmed narrative per FR-009)? → A: Yes — prepend a fixed, non-editable guardrail preamble to the owner-edited instructions body, and add a short editing guide.
- Q: Should the guardrail preamble and editing guide be shown to the owner? → A: Yes — the preamble is displayed read-only (so the owner sees the full effective prompt = preamble ⊕ body) and the editing guide is shown as accessible help. Both are generic text containing no holdings data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan allocation drift at a glance (Priority: P1)

As the portfolio owner reviewing the weekly analysis, I want to see how far each strategy bucket and each asset class has drifted from its target allocation in a table, so I can immediately tell what is over/under-weight without reading paragraphs.

**Why this priority**: Allocation drift is the core driver of every rebalance decision. Turning it from prose into a scannable table delivers the single biggest readability win and is the heart of "option B." It stands alone as a viable improvement even if no other section is converted.

**Independent Test**: Generate (or open) a weekly analysis that contains bucket and asset-class drift. The detail page shows a "Bucket drift" table and an "Asset-class drift" table with target %, actual %, and drift, each row visually flagging over/under-weight. Verified without touching any other section.

**Acceptance Scenarios**:

1. **Given** a completed analysis whose run produced bucket-level drift data, **When** I open its detail page, **Then** I see a table with one row per bucket showing the bucket name, target weight, current weight, and signed drift, with over-weight and under-weight rows visually distinguished.
2. **Given** a completed analysis whose run produced asset-class drift data, **When** I open its detail page, **Then** I see an analogous asset-class drift table.
3. **Given** an older analysis generated before this feature shipped (no structured drift fields), **When** I open its detail page, **Then** the drift tables are simply absent (no empty shells, no errors) and the narrative still renders.

---

### User Story 2 - Review risk flags and caps as tables (Priority: P2)

As the portfolio owner, I want concentration-cap breaches and rule-triggered watchlist flags shown as structured rows, so I can quickly see which holdings are near or over a limit and which rules fired this week.

**Why this priority**: These are the risk-management sections. They are list-shaped and benefit clearly from tabular display, but they are secondary to the drift view that drives the actual orders.

**Independent Test**: Open an analysis whose run produced concentration-cap and watchlist data; confirm a "Concentration caps" table (showing the holding, the cap, the current level, and soft/hard status) and a "Watchlist" table (showing each flagged item and the rule/reason that triggered it) render, independent of other sections.

**Acceptance Scenarios**:

1. **Given** an analysis with concentration-cap findings, **When** I open the detail page, **Then** I see a table listing each capped entity, its soft and/or hard limit, its current measured level, and whether the soft or hard cap is breached.
2. **Given** an analysis with watchlist flags, **When** I open the detail page, **Then** I see a table listing each flagged holding/topic and the rule or condition that triggered the flag.
3. **Given** an analysis where no caps are breached and no watchlist rules fired, **When** I open the detail page, **Then** these tables are omitted entirely rather than shown empty.

---

### User Story 3 - See week-over-week analytical deltas and proposed framework changes (Priority: P3)

As the portfolio owner, I want the week-over-week analytical comparisons and any suggested amendments to the strategic framework presented as structured rows, so I can track how the assessment changed and decide whether to update my framework.

**Why this priority**: Useful longitudinal and governance context, but the least decision-critical of the three stories and the most prose-tolerant; safe to ship last.

**Independent Test**: Open an analysis that recorded week-over-week analytical deltas and/or framework-amendment suggestions; confirm each renders as a structured list/table distinct from the feature-006 position-changes table.

**Acceptance Scenarios**:

1. **Given** an analysis with week-over-week analytical deltas (metrics/assessments that changed since last week, beyond raw position quantity changes), **When** I open the detail page, **Then** I see them as structured rows with the metric, prior value, current value, and direction of change.
2. **Given** an analysis with one or more suggested framework amendments, **When** I open the detail page, **Then** I see each suggestion as a structured row with what it proposes changing and the rationale.
3. **Given** an analysis that recorded neither, **When** I open the detail page, **Then** neither section appears.

---

### User Story 4 - Safely edit the analysis instructions (Priority: P2)

As the portfolio owner, I want a fixed guardrail preamble that always governs the analysis (and that I can see but not break), plus a short guide explaining what is safe to edit, so I can adjust the narrative instructions without producing failed runs or letting the model invent or recompute figures.

**Why this priority**: This feature now relies on the editable instructions to trim the narrative (FR-009), which raises the risk that an edit pushes the model to invent numbers, recompute the code-owned tables, or break the output contract. The guardrail preamble is what keeps the model from undermining the very tables this feature adds, so it ships alongside the risk sections rather than last.

**Independent Test**: Open the instructions editor; confirm a read-only guardrail preamble and an editing guide are visible, that the editable body is separate from the preamble, and that a subsequent analysis run applies the preamble regardless of body content.

**Acceptance Scenarios**:

1. **Given** the instructions editor, **When** I open it, **Then** I see the fixed guardrail preamble rendered read-only above my editable body, and an accessible editing guide.
2. **Given** I am editing the instructions, **When** I try to alter or remove the preamble, **Then** the editor does not allow it — only the body below the preamble is editable.
3. **Given** any saved instructions body, **When** the next analysis runs, **Then** the effective system prompt is the preamble followed by my body, so the guardrails apply even if my body omits them.
4. **Given** an analysis run, **When** the model returns output, **Then** the code-computed drift/asset-class/concentration-cap tables are not recomputed or restated in the prose narrative.

---

### Edge Cases

- **Pre-feature analyses**: Records generated before this feature lack the new structured fields. The page MUST render them exactly as before (full narrative, no empty table shells, no errors). Backfilling old records is out of scope.
- **Partial data**: A run may produce some structured sections but not others (e.g., drift but no watchlist). Each section renders independently; missing ones are omitted.
- **Failed runs**: A failed analysis may have captured some structured context before failing. Structured sections that exist are shown; the failure banner still takes precedence as today.
- **Duplication with narrative**: Content promoted to a structured table SHOULD NOT also be repeated verbatim in the trimmed narrative; the narrative keeps interpretation/reasoning, not the raw rows.
- **Empty vs. unknown**: A section with an empty result that means "checked, nothing to report" (e.g., no caps breached) is treated the same as absent for display purposes (section omitted), matching the existing convention for orders.
- **Malformed structured data**: If a stored structured section is present but malformed, it MUST NOT crash the page; the section is skipped and the rest of the page renders.
- **Framework targets unavailable**: If the machine-readable bucket/asset-class targets or cap limits are missing for a run, the code-computed sections (drift, caps) are omitted for that analysis; the LLM-emitted sections and narrative still render, and the run does not fail solely for this reason.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The weekly analysis generation MUST capture, as discrete structured data (not only as prose), the following sections when they apply, sourced as follows:
  - **Code-computed** from current holdings + machine-readable framework targets: bucket drift vs. target, asset-class drift vs. target, concentration caps (soft/hard).
  - **LLM-emitted** via the analysis tool: watchlist (rule-triggered flags), week-over-week analytical deltas, framework-amendment suggestions.
- **FR-001a**: The strategic framework's bucket/asset-class target weights and concentration-cap limits MUST be available to the generation step in a machine-readable form so the code-computed sections can be derived; if those targets are not available for a run, the affected code-computed sections are omitted (treated like any absent section per FR-008) rather than blocking the analysis.
- **FR-002**: Each structured section MUST be persisted with the analysis record so it is available for display on later visits without re-running the analysis.
- **FR-003**: All new structured sections MUST be optional at the storage/display layer; an analysis that lacks a given section (including every analysis generated before this feature, and code-computed sections for which targets were unavailable) MUST remain valid and displayable.
- **FR-004**: The analysis detail page MUST render each present structured section as a table or card group with clearly labeled columns, consistent with the existing structured sections' visual style.
- **FR-005**: The bucket-drift and asset-class-drift displays MUST show, per row, the target weight, the current weight, and the signed drift, and MUST visually distinguish rows by the sign of the drift — positive = over-weight, negative = under-weight, zero = on-target (no tolerance band).
- **FR-006**: The concentration-caps display MUST show, per row, a label identifying the capped entity and what dimension it caps (single-name, issuer, bucket, asset class, etc. — whatever the framework defines), its soft and/or hard limit, the current measured level, and whether a soft or hard cap is breached.
- **FR-007**: The watchlist display MUST show, per row, the flagged holding/topic and the rule or condition that triggered it.
- **FR-008**: A structured section that is absent, empty-meaning-nothing-to-report, or malformed MUST be omitted from the page without rendering an empty shell and without raising an error.
- **FR-009**: The narrative body MUST be retained for prose-shaped content (executive summary, market interpretation, reasoning) and MUST NOT duplicate the raw rows that have been promoted to structured tables. This de-duplication MUST be achieved by updating the editable analysis instructions/metaprompt (feature 005) so the model no longer emits those sections in prose — not by post-hoc stripping of the generated markdown.
- **FR-010**: The one-paragraph executive summary used on the analysis list page MUST continue to be produced and displayed unchanged.
- **FR-011**: The structured sections already rendered by features 006 and 007 (macro context, portfolio totals, week-over-week position changes, suggested orders + execution controls) MUST be left intact and unchanged by this feature.
- **FR-012**: The week-over-week analytical-deltas section MUST be visually and semantically distinct from the existing feature-006 position-changes table (it covers metric/assessment changes, not raw quantity changes).
- **FR-013**: Re-running an analysis for the same week MUST replace its structured sections wholesale, consistent with the existing whole-record replacement behavior.
- **FR-014**: A fixed, non-editable **guardrail preamble** MUST be prepended to the owner-edited instructions body to form the effective system prompt (preamble followed by body). This revises the prior model in which the edited document was the entire prompt verbatim.
- **FR-015**: The guardrail preamble MUST direct the model to: (a) use only the data provided in the request and never invent or estimate figures; (b) treat the code-computed bucket-drift, asset-class-drift, and concentration-cap tables as authoritative and NOT recompute or restate them in prose (supporting FR-009); and (c) return results only via the analysis tool in the required structure.
- **FR-016**: The instructions editor MUST prevent the owner from editing or removing the preamble; only the body below it is editable.
- **FR-017**: The instructions editor MUST display the guardrail preamble read-only (so the owner can see the full effective prompt) and MUST make the editing guide accessible from the editor.
- **FR-018**: A short **editing guide** MUST be provided that covers at minimum: what the editable body controls versus what the preamble and code own, that figures must never be invented, that the code-computed tables must not be recomputed, and that the output shape is enforced by the analysis tool (so malformed instructions cause a clean failed run rather than corrupted or misleading stored data).
- **FR-019**: The guardrail preamble and editing guide MUST contain only generic instruction text with no real holdings data, so they are safe to commit to the repository and display to the owner.

### Key Entities *(include if feature involves data)*

- **Weekly Analysis**: The existing per-week analysis record. Gains optional structured sections alongside its existing narrative, summary, orders, macro context, totals, and position changes.
- **Bucket Drift Row** (code-computed): A strategy bucket with its target weight, current weight, and drift.
- **Asset-Class Drift Row** (code-computed): An asset class with its target weight, current weight, and drift.
- **Concentration Cap Row** (code-computed): A capped entity (with a label identifying what it caps), its soft/hard limits, current level, and breach status.
- **Watchlist Flag** (LLM-emitted): A flagged holding/topic with the rule or condition that triggered it.
- **Week-over-Week Delta** (LLM-emitted): An analytical metric/assessment with its prior value, current value, and direction of change.
- **Framework Amendment Suggestion** (LLM-emitted): A proposed change to the strategic framework with its rationale.
- **Framework Targets** (input): The machine-readable bucket/asset-class target weights and concentration-cap limits the code-computed sections are derived from.
- **Guardrail Preamble**: A fixed, non-editable block prepended to the owner's instructions body to form the effective system prompt; displayed read-only in the editor.
- **Editing Guide**: Owner-facing help text explaining what is safe to edit and the invariants the preamble/code enforce; displayed alongside the editor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For an analysis that contains all targeted sections, the owner can identify every over-weight and under-weight bucket and asset class without reading any prose paragraph.
- **SC-002**: 100% of the targeted sections (bucket drift, asset-class drift, concentration caps, watchlist, week-over-week analytical deltas, framework amendments) that the analysis reports are presented as structured tables/cards rather than prose.
- **SC-003**: The trimmed narrative no longer repeats the raw rows that have been promoted to tables; an owner reading the page sees each datum once.
- **SC-004**: Every analysis generated before this feature continues to open and display correctly, with zero errors and zero empty table shells.
- **SC-005**: Opening an analysis detail page surfaces the structured sections from stored data with no need to re-run the analysis.
- **SC-006**: The previously structured sections (macro, totals, position changes, suggested orders) behave identically to before this feature.
- **SC-007**: The guardrail preamble is part of the effective system prompt on every run, and no instructions-body edit can remove or alter it.
- **SC-008**: From the instructions editor, the owner can read the full effective prompt (preamble + body) and reach the editing guide without leaving the page.

## Assumptions

- The drift and concentration-cap sections are **computed in code** for this feature (they are not produced as discrete values today — only narrated in prose), which requires the framework's targets/caps in machine-readable form (see FR-001a). The watchlist, week-over-week deltas, and framework-amendment sections remain LLM-judgment and are emitted by the model.
- The exact set of columns per table follows what the analysis already reports in prose today; where a value is not available, the row simply omits it rather than blocking the section.
- Backfilling or regenerating historical analyses to populate the new structured fields is out of scope; only new runs will contain them, and the page degrades gracefully for old ones.
- The trimmed narrative still uses the existing markdown rendering path; no new prose-formatting capability is required beyond what already exists.
- "Position-level HOLD notes" remain in the narrative (they are prose-shaped commentary, not tabular) unless they naturally fit an existing structured section; promoting them is not required by this feature.
- The analysis detail page itself remains read-only display + capture; the only new owner action introduced by this feature is editing the instructions body within the existing instructions editor (feature 005), now framed by the fixed guardrail preamble.
- Adding the guardrail preamble revises feature 005's "the edited document is the entire system prompt verbatim" model to "fixed preamble ⊕ editable body"; the body remains used verbatim below the preamble, and the seeded body is unchanged by this feature.
- The guardrail preamble and editing guide are generic, holdings-free text, so they are safe to store in the repository and to display to the owner (per FR-019).
