# Feature Specification: Editable Analysis Metaprompt

**Feature Branch**: `005-editable-metaprompt`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "I want the entire metaprompt to be editable, not just the framework. Merge the strategic framework into a single editable instructions document. No placeholder tokens — the entire instructions/metaprompt is edited as one document. The framework now holds the full instructions, keeping version history."

## Overview

Today the weekly-analysis instructions sent to the AI are assembled from two parts: a fixed instructions document maintained by developers, and an owner-authored **strategic framework** that is slotted into a single placeholder inside it. The owner can edit only the framework portion; the surrounding instructions (tone, output structure, rules, ordering of reasoning, constraints) are not editable without a code change.

This feature collapses those two parts into **one editable instructions document** that the owner controls end to end from the dashboard, surfaced under a dashboard area named **Instructions**. There are no placeholder tokens to preserve: the live portfolio data (positions, prices, date, previous analysis, country-risk reading) is already delivered to the AI separately from these instructions and is unaffected by this change. The existing framework editor — including its version history, restore, and per-analysis traceability — becomes the editor for the **whole** instructions document.

## Clarifications

### Session 2026-06-10

- Q: When merging into the full editable document, what happens to feature 004's existing framework version history? → A: Start fresh — seed one version with the merged instructions; the old framework-only history is not carried over.
- Q: The dashboard nav currently labels this "Framework". What should it be called now? → A: Rename it to **Instructions**.
- Q: An `analysis.promptVersion` setting currently selects which fixed template file to use. What happens to that concept? → A: Retire template/file selection — the editable document fully replaces versioned template files; analyses are traced by their instructions-version reference.
- Q: What maximum size should the editable instructions allow? → A: 256 KB.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit the complete analysis instructions (Priority: P1)

The owner opens the instructions editor in the dashboard and sees the **entire** set of instructions the AI receives for the weekly analysis — not just the framework section. They edit any part of it (rules, output format, reasoning steps, the former framework content) as one free-form document and save it. The next weekly analysis uses exactly the saved text as its instructions.

**Why this priority**: This is the core capability the feature exists to deliver. Without it, the owner still cannot change the surrounding instructions. It is independently valuable on its own.

**Independent Test**: Open the editor, confirm it shows the full instructions (not a fragment), change a sentence in a section that was previously developer-only, save, then trigger an analysis and confirm the change took effect in how the AI was instructed.

**Acceptance Scenarios**:

1. **Given** the editor is open, **When** the owner views the content, **Then** it shows the complete instructions document, including what used to be the fixed developer portion and the framework portion as one continuous document.
2. **Given** the owner has edited any part of the document, **When** they save, **Then** the new full document is stored as the active instructions and confirmed saved.
3. **Given** a new active instructions document exists, **When** the next weekly analysis runs, **Then** the AI receives the saved document verbatim as its instructions, with no token substitution applied to it.
4. **Given** the owner saves content identical to the current active version, **When** the save completes, **Then** no new version is recorded and the owner is told there were no changes.

---

### User Story 2 - Review and restore previous versions (Priority: P2)

The owner views a history of every saved version of the instructions document, with timestamps and optional change notes, can open any past version to read its full content, and can restore a past version as the new active document.

**Why this priority**: Editing the full instructions is higher-stakes than editing just the framework — a bad edit can degrade every future analysis. History and one-click restore are the safety net that makes free editing safe. It depends on P1 but delivers its own distinct value.

**Independent Test**: Save two different versions, open the history list, expand an older entry to read its content, restore it, and confirm the active document now matches the restored version and a new history entry records the restore.

**Acceptance Scenarios**:

1. **Given** at least one prior save exists, **When** the owner opens history, **Then** entries are listed newest-first with timestamp, optional change note, and whether each was a direct edit or a restore.
2. **Given** the owner expands a history entry, **When** it loads, **Then** the full content of that version is shown read-only.
3. **Given** the owner chooses to restore a past version, **When** they confirm, **Then** that version's content becomes the active document and a new history entry is appended marking it as a restore of the chosen version.
4. **Given** no prior saves exist, **When** the owner opens history, **Then** an explicit empty state is shown.

---

### User Story 3 - Trace which instructions produced an analysis (Priority: P3)

When reviewing a past weekly analysis, the owner can identify exactly which version of the instructions document was active when that analysis was generated, and navigate to that version.

**Why this priority**: Useful for understanding why a given analysis behaved as it did, especially after the instructions have since changed. It builds on P1 + P2 and is the lowest-priority of the three but completes the audit story.

**Independent Test**: Generate an analysis, change the instructions, then open the earlier analysis and confirm it references and links to the instructions version that was active at the time it ran — not the current one.

**Acceptance Scenarios**:

1. **Given** an analysis was generated while a specific instructions version was active, **When** the owner views that analysis, **Then** it records a reference to that exact version.
2. **Given** the instructions have changed since an analysis ran, **When** the owner opens that analysis, **Then** the referenced version is the one active at run time, not the current active version.
3. **Given** an analysis predates this feature (no recorded version), **When** the owner views it, **Then** the absence of a version reference is handled gracefully without error.

---

### Edge Cases

- **Empty document**: Saving empty or whitespace-only content is rejected — the analysis cannot run without instructions.
- **Oversized document**: Content exceeding the maximum allowed size (256 KB) is rejected at save time with a clear message; the size limit accommodates the merged document, which is larger than the former framework-only content.
- **Analysis runs with no instructions configured**: If no active instructions document exists, the weekly analysis fails clearly stating that instructions are not configured, rather than running with empty or partial instructions.
- **Save mid-analysis**: If the owner saves a new version while an analysis is in progress, the in-progress analysis continues using the version captured when it started.
- **Migration of existing content**: On first use after this feature ships, the active instructions document is seeded so the AI's effective instructions are unchanged from before (the former fixed instructions with the existing framework already merged in).
- **Restoring an identical version**: Restoring a version whose content equals the current active document records no new change (treated as a no-op), consistent with direct saves.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present a single editable instructions document representing the complete instructions the AI receives for the weekly analysis, with no separate framework editor.
- **FR-002**: The owner MUST be able to edit any part of the document as free-form text and save it as the new active instructions.
- **FR-003**: The system MUST NOT perform any placeholder/token substitution on the instructions document; it is used verbatim. (Live portfolio and market data continue to be delivered to the AI separately and are out of scope for editing here.)
- **FR-004**: The weekly analysis MUST use the active instructions document verbatim as the AI's instructions.
- **FR-005**: The system MUST reject saving empty or whitespace-only content with a clear, user-facing message.
- **FR-006**: The system MUST enforce a maximum document size of 256 KB, and reject oversized saves with a clear message indicating the limit and current size.
- **FR-007**: The system MUST treat a save whose content equals the current active document as a no-op (no new version recorded) and inform the owner that there were no changes.
- **FR-008**: The system MUST maintain an append-only version history of every saved version, retaining all prior versions.
- **FR-009**: Each history entry MUST capture a timestamp, an optional owner-supplied change note, and whether it originated from a direct edit or a restore (and, for a restore, which version it restored).
- **FR-010**: The owner MUST be able to view the version history newest-first and open any version to read its full content.
- **FR-011**: The owner MUST be able to restore any past version, which becomes the new active document and appends a new history entry marking it as a restore.
- **FR-012**: When a weekly analysis runs, the system MUST capture which instructions version was active at the start and record that reference on the resulting analysis (snapshot-at-start; later saves do not affect an in-progress run).
- **FR-013**: When viewing a past analysis, the owner MUST be able to identify and navigate to the instructions version that produced it; analyses created before this feature (with no recorded version) MUST be handled gracefully.
- **FR-014**: If no active instructions document is configured, the weekly analysis MUST fail with a clear message stating instructions are not configured, rather than proceeding.
- **FR-015**: On first deployment of this feature, the system MUST seed the active instructions document so that the AI's effective instructions are unchanged from the prior behavior (former fixed instructions with the existing framework merged in), preserving content exactly including whitespace.
- **FR-016**: Access to view and edit the instructions document MUST remain operator-only, consistent with the prior framework editor's access control.
- **FR-017**: The editor MUST allow the owner to preview the document as formatted text before saving, consistent with the prior framework editor's edit/preview capability.
- **FR-018**: The dashboard area, navigation entry, and page for this document MUST be labeled **Instructions** (replacing the prior "Framework" label).
- **FR-019**: The system MUST retire selection of fixed instructions template files: the active editable document fully replaces versioned template files as the source of the AI's instructions, and analyses MUST be traced solely by their instructions-version reference (FR-012) rather than by a template-version identifier.
- **FR-020**: On first deployment, the system MUST seed exactly one initial instructions version (the merged content per FR-015); it MUST NOT carry over the prior framework-only version history from the superseded feature. Pre-existing framework history need not be accessible from the new Instructions area.

### Key Entities *(include if feature involves data)*

- **Instructions Document (active)**: The current, complete set of AI instructions for the weekly analysis. Has the full text content, a reference to the history version that produced it, and a last-updated timestamp. There is exactly one active document.
- **Instructions Version (history entry)**: An immutable snapshot of the document at a point in time. Has full content, timestamp, optional change note, origin (direct edit vs. restore), and — when a restore — a reference to the version it restored. History is append-only.
- **Weekly Analysis (existing entity, extended)**: Gains a reference to the Instructions Version that was active when the analysis started, enabling traceability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can change any part of the analysis instructions (including sections previously requiring a code change) and have it take effect on the next analysis, with zero code changes or redeployment.
- **SC-002**: 100% of newly generated analyses record which instructions version produced them.
- **SC-003**: Any previously saved instructions version can be restored to active in a single confirmed action.
- **SC-004**: Immediately after the feature ships and before any edit, the instructions the AI receives are byte-for-byte equivalent to what it received before the feature, so analysis behavior is unchanged until the owner intentionally edits.
- **SC-005**: Invalid saves (empty, whitespace-only, or oversized) are prevented 100% of the time with a message that tells the owner what to fix.
- **SC-006**: There is exactly one place in the dashboard — the **Instructions** area — to edit AI instructions; the former separate "Framework" editor no longer exists as a distinct concept.

## Assumptions

- The live portfolio/market data (positions, prices, current date, previous analysis, country-risk reading) is delivered to the AI separately from these instructions and is **not** part of the editable document; this feature does not change how that data is assembled or injected.
- Because the editable document is the AI's instructions only (not the data), removing all placeholder tokens does not break data injection — there were no data tokens inside the instructions to begin with beyond the single framework slot being eliminated.
- The existing version-history model from the strategic-framework feature (append-only history, restore, no-op detection, snapshot-at-start traceability, operator-only access) is reused and extended to cover the full document rather than replaced.
- The maximum document size is 256 KB, sized comfortably above the seeded merged content.
- The seeded initial content is derived from the current effective system instructions (fixed instructions with the existing framework merged), so existing owners experience no behavior change until they edit. Exactly one initial version is seeded.
- This change supersedes the separate strategic-framework editor (feature 004). The new Instructions document starts with fresh version history (one seeded version); feature 004's prior framework-only history is not migrated into it. Whether to reuse 004's underlying storage in place or stand up new storage is an implementation choice deferred to planning, as long as the new history starts fresh.
- Selection of fixed instructions template files is retired; the editable document is the single source of the AI's instructions, and the prior `promptVersion` template-selection concept no longer governs which instructions are used.
- Only a single owner/operator uses this; concurrent multi-user editing is out of scope.
