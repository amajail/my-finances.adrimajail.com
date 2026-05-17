# Research — Editable Strategic Framework

Phase 0 design-decision rationale. Each section follows the Decision / Rationale / Alternatives format.

---

## R1 — RowKey format for `portfolioFrameworkHistory`

**Decision**: Single partition (`PartitionKey = 'framework'`). RowKey = `descTimestamp + '-' + nonce`, where:
- `descTimestamp` = `(9999999999999 - epochMs).toString().padStart(13, '0')` — a 13-digit number that decreases as time advances.
- `nonce` = 4 random hex chars (16 bits, sufficient to disambiguate same-millisecond saves for a single-user app).

Example: epoch `1715967600123` → descTimestamp `8284032399876` → RowKey `8284032399876-a3f9`.

**Rationale**: Azure Tables returns rows in ascending RowKey order. A descending-timestamp prefix means a single `listEntities` call (no `--reverse`, no client-side sort needed) yields the newest entries first — exactly what the history view needs (FR-006). Single partition is correct because the row count is small (~52/year baseline, ~250/year heavy) and all queries are "give me the history of the framework," never partitioned by some other dimension. The nonce is paranoia; a single-user app realistically never hits same-ms collisions, but it's three lines of code to be safe.

**Alternatives considered**:
- *Ascending timestamp + client-side sort*: works but pulls all rows just to reverse them. The descending-prefix trick gets the same result for free.
- *ULID*: overkill — ULIDs are 26 chars and provide multi-machine uniqueness we don't need. The padded-int + nonce is shorter and trivially decodable back to a timestamp.
- *GUID RowKey + separate `createdAt` property*: would require server-side filtering + client-side sorting on every list. Rejected.

---

## R2 — Atomic save semantics (history row + active-pointer update)

**Decision**: Two-step sequence inside `SaveFramework` use-case:
1. Write the new row to `portfolioFrameworkHistory` (full content, metadata).
2. Upsert the `portfolioSettings` row `settings/analysis.strategicFrameworkV1` with `{ value: <new content>, historyRowKey: <step-1 RowKey>, updatedAt: <ISO> }`.

If step 2 fails after step 1 succeeded, the history row is an "orphan": it exists, is readable, and listed in history, but the active framework still points at the prior version. The next save attempt simply overwrites the active pointer; nothing needs to be reconciled. The history row remains valid history (it really does represent a save attempt).

**Rationale**: Azure Tables has no cross-table transactions for tables in different physical groups. Either-or atomicity is impossible without storing both rows in the same partition of the same table — which we deliberately rejected (R1, R7 below). Sequencing history-first is the right tradeoff:
- If history-write fails: nothing changes, caller sees an error and retries.
- If active-update fails: history shows the attempted save; the user can simply save again (or Restore, post-P3) to make it active.
- The alternative ordering (active-first, history-second) would create a worse failure mode: the active framework would be updated but with no history record, violating FR-005's "every successful save MUST be recorded."

**Alternatives considered**:
- *Co-locate active + history in the same table partition* (would enable an entity-group transaction): would force the "active" record to live under the same PartitionKey as history rows, complicating reads and conflating concerns. Rejected.
- *Best-effort retry on step 2 inside the use-case*: would mask transient failures from the caller and give false confirmation. Better to surface the error.

---

## R3 — No-op detection

**Decision**: Inside `SaveFramework`, after normalizing both sides (trim trailing/leading whitespace, normalize CRLF→LF), compare byte-for-byte against the currently-active content (read via `GetActiveFramework` or directly via the repo). If they match, return `{ noop: true, historyRowKey: <existing> }` **without writing**.

**Rationale**: FR-011 explicitly requires this to avoid history noise from accidental re-saves (e.g., the owner clicks Save twice, or opens the page after a refresh and clicks Save without realizing nothing changed). Doing it in the use-case (not the repo) keeps the repo dumb. Normalization is generous so cosmetic newline differences (editor auto-trims, browser-side LF normalization) don't create phantom diffs.

**Alternatives considered**:
- *No detection, every save is a row*: rejected — pollutes history quickly and dilutes the audit value.
- *Hash-based comparison*: same outcome, slightly slower and harder to debug. Direct byte compare on the (small) content is fine.

---

## R4 — 60 KB enforcement (UTF-8 bytes)

**Decision**: The cap is **UTF-8 byte length**, not character length. Enforced in **two places**:
- **Domain** (`FrameworkHistoryEntry` constructor): throws `DomainError` if `Buffer.byteLength(content, 'utf8') > 61440`. This is the load-bearing check.
- **Use-case** (`SaveFramework.execute`): pre-check before constructing the entity, throws `ValidationError` with a structured message so the API returns 400 with a clean payload rather than the more generic 500-from-domain-error path.

The editor mirrors via `new TextEncoder().encode(value).byteLength` with a live counter; save button is disabled when over the cap.

**Rationale**: The downstream constraint is Azure Tables' 64 KB per-property limit (string properties are stored as UTF-16, but the API rejects payloads where the *post-serialization* byte length exceeds 64 KB; in practice the per-property cap is conservatively 32 KB UTF-16 chars / 64 KB OData payload). 60 KB UTF-8 is a deliberate cushion under that limit that's still wildly larger than any realistic strategic doc (rough rule of thumb: 30+ pages of prose). Character-count limits are wrong because multi-byte characters (em-dashes, accented Spanish characters in a doc that mixes English/Spanish) inflate byte size unpredictably.

**Alternatives considered**:
- *Character count*: incorrect under UTF-8. Rejected.
- *Storage-layer rejection only* (Option B from clarification): rejected by the user; produces opaque errors and no editor feedback.
- *Lower cap (20 KB)* (Option C from clarification): too tight for owner's foreseeable doc evolution; the 64 KB hard limit gives plenty of room for a generous-but-safe cap.

---

## R5 — Restore semantics

**Decision**: `RestoreFrameworkVersion(rowKey, { changeNote? })`:
1. Read the target history entry via `IFrameworkRepository.getHistoryEntry(rowKey)`. If 404, surface as `NotFoundError`.
2. Call `SaveFramework.execute({ content: targetEntry.content, changeNote: changeNote ?? \`Restored from \${targetEntry.timestamp}\`, source: 'restore', restoreOfRowKey: rowKey })`.

Result: a new history entry whose content equals the restored version, tagged with `source: 'restore'` and `restoreOfRowKey: <original>`. The original entry is unchanged. The active framework now equals the restored content (FR-008).

**Rationale**: Treating restore as "a save with extra metadata" is the simplest possible implementation. No special path through the repository; no separate transactionality concerns; no append-only invariant to enforce beyond what SaveFramework already gives us. The `source` + `restoreOfRowKey` metadata is what lets the history view render "Restored from 2026-05-10 14:02" as a system-generated note.

**Edge case — restore is a no-op**: if the user restores a version whose content equals the *current* active framework (e.g., they restored, then restored the same one again), the underlying `SaveFramework` no-op detection fires and we return `{ noop: true }` without a new history row. The active framework is already what they wanted; nothing to do.

**Alternatives considered**:
- *Mutate the active framework's `historyRowKey` to point back at the original entry* (no new history row): rejected — violates "append-only" spirit; the audit trail would no longer be chronological.
- *Copy the original entry's metadata verbatim onto the new entry*: rejected — would conflate "when this content was first written" with "when it was last made active."

---

## R6 — Pre-existing seeded content & analysis traceability

**Decision**:
- `GetActiveFramework` returns `{ content, historyRowKey, updatedAt }`. For framework content seeded before this feature ships, `historyRowKey` is `null` and `updatedAt` may also be `null` (or the legacy `timestamp` from the table system property).
- `GenerateWeeklyAnalysis` reads the framework once at the start of the run (existing behavior, see `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:130`). It now captures `historyRowKey` from that same read and passes it to `AzureAnalysisRepository.save()`, which persists it on the `portfolioAnalysis` row as `frameworkHistoryRowKey`.
- For analyses produced before this feature ships (existing rows), `frameworkHistoryRowKey` is absent. The dashboard UI renders that case as "Framework version: (pre-history seed)" rather than crashing or hiding the field.

**Rationale**: Per FR-013 the system must keep working from day one without retroactive backfill. Per the clarification, no migration is required — Azure Tables tolerates the optional property gracefully. The "(seeded)" / "(pre-history seed)" labels are the explicit-empty-state contract the spec already commits to.

**Alternatives considered**:
- *Backfill a "seed" history row on first run*: rejected by spec assumption ("pre-existing content is NOT retroactively backfilled as a history row"). Adds migration risk for negligible benefit.
- *Refuse to start the feature without a backfill step*: would block the feature on an unnecessary chore. Rejected.

---

## R7 — Editor UX: single page vs. two routes

**Decision**: A single Astro page at `/framework` containing two sections:
1. **Editor** (top): `<textarea>` pre-populated with active content, optional `<input>` for change note, live byte counter, Save button, last-saved timestamp.
2. **History** (below or as a panel): list of entries newest-first; each row shows timestamp + change note (or system-generated label) + Source tag (Edit / Restore from X). Selecting an entry expands an inline read-only viewer + Restore button (with a confirm step).

Top-level nav entry added via `dashboard/src/layouts/Layout.astro` (extend `active` union with `'framework'`, append to `navItems`).

**Rationale**: The clarification picked a top-level nav route (Q3) but did not require a multi-page sub-routing scheme. Single-page keeps the workflow tight: edit, scan history, restore — all in one viewport, no router state to manage. It also sidesteps the static-built dynamic-route problem the analysis pages had to work around (`analysis-detail.astro` reads `?date=` from query string because Astro static builds can't generate per-row dynamic routes). For a small entity count (~250/year max), a single scrollable list is fine; pagination is deferred to v1.5 if it ever becomes needed.

**Alternatives considered**:
- *Two pages (`framework.astro` editor + `framework-history.astro` list)*: matches 002's analysis pattern but adds a navigation hop. Rejected for v1.
- *History as a modal*: hides the audit trail behind an interaction; worse discoverability for what is a P2-priority view.
- *In-app diff viewer between two versions*: explicitly out of scope per spec assumption ("No diff view in v1").

---

## R8 — Why not extend `GetSetting` / `UpdateSetting` instead of building a Framework module?

**Decision**: New module (`framework.js` HTTP file + dedicated use-cases + dedicated repo) rather than overloading `GetSetting`/`UpdateSetting`.

**Rationale**: The framework has feature-specific behavior that doesn't belong on the generic settings endpoints:
- Size cap (FR-017) — the generic settings table holds tiny scalars (model name, version strings); enforcing 60 KB there pollutes the generic surface.
- Append-only history — generic settings are mutable and have no concept of versioning.
- No-op detection — irrelevant for generic settings (and would silently swallow legitimate same-value writes elsewhere).
- Pre-existing-content semantics + analysis-row linkage — only the framework needs these.

Keeping the framework module separate respects Clean Architecture (Constitution II) and keeps the generic settings endpoint dumb.

**Alternatives considered**:
- *Extend `UpdateSetting` with a "this key is versioned" code path*: rejected — leaks framework-specific concerns into a generic use-case, and we'd still need new endpoints for history list/restore.
- *Reuse `IPositionRepository`'s patterns for revision history*: positions don't have history today, so there's nothing to reuse.
