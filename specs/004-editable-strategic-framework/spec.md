# Feature Specification: Editable Strategic Framework

**Feature Branch**: `feature/editable-strategic-framework`

**Created**: 2026-05-17

**Status**: Draft

**Input**: User description: "the prompt with my plan has to be editable from the ui, each change should be persisted in database and get an history track"

## Clarifications

### Session 2026-05-17

- Q: If a weekly rebalance analysis is mid-flight (framework already loaded) and the owner saves a new framework version before the run finishes, which version does the in-flight run use? → A: Snapshot-at-start — the analysis uses the framework version that was active when the run started; mid-run saves do not affect in-flight runs.
- Q: Should a generated weekly analysis record which framework version it used, and surface that link to the owner? → A: Yes — each analysis output stores a reference to the framework history entry it used, and the analysis UI surfaces it (e.g., "Framework version: 2026-05-17 14:02").
- Q: Where in the dashboard navigation should the Strategic Framework editor and history live? → A: Dedicated top-level dashboard route (e.g., "Framework" in the main nav), sibling to other top-level areas; editor and history are reached from there.
- Q: Should the editor warn the owner before navigating away with unsaved edits? → A: No guard — navigating away silently discards edits; no confirmation prompt and no autosave drafts in v1.
- Q: Should the system enforce a maximum size on framework content? → A: Yes — enforce a soft cap of ~60 KB with a clear UI error when exceeded. Single source of truth for the limit, enforced server-side and mirrored in the editor.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit and save the strategic framework from the dashboard (Priority: P1)

The portfolio owner opens the dashboard, navigates to a "Strategic Framework" page, sees the current framework content rendered in an editable area, makes changes, and saves. The saved content becomes the new active framework and will be used by the next weekly rebalance analysis run.

**Why this priority**: This is the core of the feature. Today the framework can only be changed by editing a gitignored local markdown file and re-running a seed script — a manual loop that requires terminal access and the local repo. Moving editing into the dashboard removes that loop entirely and is the smallest slice that delivers value.

**Independent Test**: From a browser, open the Strategic Framework page, change a line in the framework, save, refresh the page, and confirm the change is still shown. Then trigger (or wait for) a weekly analysis run and confirm the generated prompt contains the edited content.

**Acceptance Scenarios**:

1. **Given** a previously seeded framework exists, **When** the owner opens the Strategic Framework page, **Then** the current active framework content is displayed in an editor.
2. **Given** the owner has edited the framework, **When** they save, **Then** the new content becomes the active framework and a confirmation is shown.
3. **Given** the framework was just saved, **When** a weekly rebalance analysis is generated, **Then** the analysis prompt contains the just-saved framework content (not the prior version).
4. **Given** an empty save is attempted (no content), **When** the owner clicks save, **Then** the save is rejected with a clear message and the previously active framework remains in effect.
5. **Given** the owner abandons their edits without saving, **When** they navigate away and back, **Then** the displayed content is the last-saved active framework — unsaved changes are discarded silently with no confirmation prompt and no draft recovery.

---

### User Story 2 - View change history for the framework (Priority: P2)

The owner wants to know what the framework used to say, when it changed, and (optionally) why. They open a "History" view that lists every saved version in reverse-chronological order, with the timestamp and an optional change note for each entry.

**Why this priority**: History is the second pillar of the request ("get an history track"). Without it, edits are destructive: there is no record of what the framework said when a given weekly analysis was produced. This makes it harder to audit past recommendations against the assumptions in force at the time. Lower than P1 only because some value lands without it (P1 alone already removes the seed-script loop).

**Independent Test**: From the Strategic Framework page, click "History". Confirm the list shows at least the most recent N saves with timestamp, optional note, and a way to select an entry. Verify that the latest entry corresponds to the currently active framework.

**Acceptance Scenarios**:

1. **Given** the framework has been saved at least once, **When** the owner opens the history view, **Then** they see a list of versions ordered newest-first, each with timestamp and (if provided) change note.
2. **Given** the owner selects a past version from the list, **When** the entry expands or opens, **Then** the full content of that historical version is displayed read-only.
3. **Given** no framework has ever been saved through the UI, **When** the owner opens the history view, **Then** they see an empty-state message — and (if a seeded framework already exists in storage) that pre-existing content is shown as the active version with no associated history entry, not as a history row.

---

### User Story 3 - Restore a previous version (Priority: P3)

After reviewing history, the owner decides a prior version was better and wants to revert. From the history view they pick a past version and click "Restore". The selected content is promoted to become the new active framework. The restoration itself appears as a new entry in history (the previous active version is not lost — history is append-only).

**Why this priority**: Restore is convenient but not essential — once history exists (P2), the owner can manually copy a past version's text into the editor and save it. P3 turns that into a single click. Worth doing but the feature delivers value without it.

**Independent Test**: Save two distinct versions of the framework (V1 then V2 — V2 is now active). From history, select V1 and click Restore. Confirm the active framework now matches V1's content and that history shows a new entry (V3) whose content equals V1. Verify the next weekly analysis uses V3 (= V1's content).

**Acceptance Scenarios**:

1. **Given** the owner is viewing a past version in history, **When** they click Restore, **Then** they are asked to confirm.
2. **Given** the owner confirms restoration, **When** the action completes, **Then** the active framework now equals the selected past version's content AND a new history entry is recorded with a system-generated change note indicating which past version was restored.
3. **Given** the owner restores a past version, **When** they cancel at the confirmation step, **Then** no change is made and the active framework is unchanged.

---

### Edge Cases

- **Existing seeded framework with no UI history**: when the feature ships, the currently-active framework already exists in storage but has no history row associated with it. The system must display this content as active and not crash the history view when no entries exist.
- **Very long content**: the framework is free-form markdown and may grow over time. The editor must handle multi-page content without truncation up to the 60 KB cap (FR-017); content exceeding the cap is rejected at save time with a clear error.
- **Identical save (no actual change)**: if the owner saves content byte-identical to the current active version, the system should detect this and skip recording a no-op history entry to avoid history noise.
- **Failure during save**: if the save operation fails partway (e.g., network error), the previously active framework must remain in effect and the owner must see a clear error so they can retry without losing their pending edits.
- **Stale view**: if the framework was changed in another session/tab while the owner is editing, on save the system overwrites (last-save-wins) — but the overwritten version remains visible in history as a prior entry.
- **Empty or whitespace-only save**: rejected as invalid (the framework must contain content because the analysis prompt depends on it).
- **Save during an in-flight analysis run**: the save is accepted normally and recorded as a new history entry; the in-flight run continues with the framework it snapshotted at start. Only runs that begin after the save will see the new framework.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST provide a dedicated **top-level** navigation entry (e.g., "Framework") that opens a page where the owner can view and edit the strategic framework as free-form text/markdown. The history view (FR-006) is reached from this same top-level area.
- **FR-002**: The editor MUST be pre-populated with the currently active framework content on load.
- **FR-003**: The system MUST persist a saved framework such that subsequent weekly rebalance analyses use the saved content as the framework input.
- **FR-004**: The system MUST reject saves where the content is empty or whitespace-only, and surface the rejection reason to the owner.
- **FR-005**: Every successful save MUST be recorded as an immutable history entry containing at minimum: the full content saved, an absolute timestamp, and an optional owner-supplied change note.
- **FR-006**: The system MUST provide a way to view the list of historical framework versions ordered newest-first.
- **FR-007**: The system MUST allow viewing the full content of any historical version in read-only form.
- **FR-008**: The system MUST allow restoring any historical version as the new active framework. Restoration creates a new history entry whose content equals the restored version; the prior active version is preserved in history.
- **FR-009**: History MUST be append-only — no operation in the UI may delete or alter past history entries.
- **FR-010**: The edit and save operations MUST be gated behind the same operator-only access protection used by other write/operator endpoints (the dashboard's existing function-key gating). Read access to active content follows the same access pattern as other dashboard data.
- **FR-011**: If a save attempt produces content byte-identical to the current active framework, the system MUST NOT create a new history entry (no-op detection).
- **FR-012**: The system MUST preserve and display the framework content with whitespace and formatting intact, since it is consumed downstream as markdown injected into an analysis prompt.
- **FR-013**: When no UI-driven history exists yet (first run after the feature ships), the system MUST still display the pre-existing seeded framework as active, and the history view MUST render an explicit empty state rather than an error.
- **FR-014**: A weekly rebalance analysis run MUST bind to the framework version that is active at the moment the run starts (snapshot-at-start). Saves that occur after a run has started but before it finishes MUST NOT alter that run's framework input — they take effect only for subsequent runs.
- **FR-015**: Each generated weekly analysis MUST persist a reference to the specific framework history entry whose content was used as input for that run. For an analysis produced before this feature ships (i.e., from the pre-existing seeded framework with no history row), the reference may be empty or indicate "pre-history seed".
- **FR-016**: The analysis-output UI MUST surface the framework version that produced each analysis (at minimum a timestamp and, when available, the optional change note from that history entry) and allow the owner to view the full content of that exact framework version in read-only form.
- **FR-017**: The system MUST reject saves whose content exceeds a documented maximum size (60 KB). The limit MUST be enforced server-side and mirrored in the editor (e.g., live character/byte counter and disabled save button when over the cap), with a clear error message rather than a raw storage-layer error.

### Key Entities *(include if feature involves data)*

- **Strategic Framework (active)**: The single current source of truth for the framework content used by the weekly rebalance analysis. There is exactly one active framework at any time. Key attributes: content (markdown text), last-updated timestamp, pointer to the history entry that produced it (when one exists).
- **Strategic Framework History Entry**: An immutable snapshot recorded each time the framework is saved through the UI (including restores). Key attributes: stable identifier, full content, timestamp, optional change note, source-of-change indicator (direct edit vs. restore-of-version-X). History entries are ordered by timestamp.
- **Weekly Analysis Output (existing entity, extended)**: gains a new attribute — a reference to the Strategic Framework History Entry whose content was the framework input for that analysis run. May be empty for analyses produced from the pre-existing seeded framework (no history row).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can edit, save, and have the new framework take effect in the next weekly analysis without opening a terminal, editing a local file, or running a script — the entire round-trip happens in the browser in under 2 minutes.
- **SC-002**: Every framework change made through the UI is recoverable: 100% of saves produce a retrievable history entry whose content is byte-identical to what was saved.
- **SC-003**: From the history view, the owner can identify and view any past version in under 30 seconds (open history → locate entry by timestamp/note → view content).
- **SC-004**: Restoring a past version takes no more than 3 clicks from the history view (select → restore → confirm) and the active framework reflects the restored content immediately after confirmation.
- **SC-005**: No save through the UI causes loss of previous content — over any sequence of N saves and M restores, all N+M historical contents remain retrievable.

## Assumptions

- **Single owner**: the dashboard is used by a single owner (the portfolio holder). No multi-user authorship, no role hierarchy, no per-user attribution beyond what the access gate already implies. Concurrent-edit conflict resolution is therefore out of scope beyond the basic "last save wins" + history-preserves-prior-versions behavior.
- **Existing access gating reused**: write operations on the framework reuse the same operator-only gating mechanism already protecting other operator endpoints (e.g., manual price refresh). No new authentication system is introduced.
- **Storage layer reused**: the active framework continues to live in the existing `portfolioSettings` row that `GenerateWeeklyAnalysis` already reads from. History is a new collection stored in the same database. No new database technology is introduced.
- **No history retention cap in v1**: all history entries are retained indefinitely. The framework is a small piece of text and write rate is low (a few saves per week at most), so storage cost is not a concern in v1. A retention/cap policy can be added later if needed.
- **Markdown is free-form**: the framework is free-form markdown with no required schema or validation beyond non-empty. The downstream analysis prompt template injects the content as-is into a slot.
- **No diff view in v1**: the history view shows full versions side-by-side or sequentially. An inline diff visualization between two versions is a possible future enhancement but is not required for v1.
- **No history-entry deletion or editing**: history is append-only by design. Trimming/archival, if ever needed, is out of scope for v1.
- **Pre-existing seeded content**: at feature launch a framework already exists in storage (from the current seed script). This pre-existing content is treated as active and is NOT retroactively backfilled as a history row — the first UI save will be the first history entry.
- **Change-note is optional**: the owner may save without supplying a change note. Notes are for the owner's own memory and are not required for correctness.
- **No unsaved-changes guard in v1**: the editor does not warn before navigating away with unsaved edits and does not autosave drafts. The owner is responsible for clicking Save before leaving the page.
