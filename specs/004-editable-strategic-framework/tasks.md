---
description: "Task list for feature 004 — Editable Strategic Framework"
---

# Tasks: Editable Strategic Framework

**Input**: Design documents from `/specs/004-editable-strategic-framework/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅

**Tests**: Included per Constitution IV ("Pragmatic Testing — entity validation, use-case orchestration, HTTP route smoke"). The Astro editor UI itself is exempt; manual verification follows `quickstart.md`.

**Organization**: Tasks grouped by user story (US1=P1 editor/save, US2=P2 history view, US3=P3 restore) plus a cross-cutting analysis-traceability phase. Each user-story phase is independently shippable.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Parallelizable with other [P] tasks in the same phase (different files, no shared mutations).
- **[Story]**: User-story tag (US1 / US2 / US3) for user-story phases only.

## Path Conventions

Web app: backend in `src/`, frontend in `dashboard/src/`, tests in `tests/`. All paths below are repository-root-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Provision the new storage table so foundational work has somewhere to write.

- [X] T001 Add `frameworkHistoryClient` (new `portfolioFrameworkHistory` table) to `src/database/AzureTableDatabase.js` — include it in both the constructor's `TableClient.fromConnectionString(...)` block and the `initialize()` createTable loop. Match the existing pattern used for `analysisClient` / `ordersClient`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain entity, repository interface + implementation, DI wiring — everything every user-story phase needs.

**⚠️ CRITICAL**: No user-story phase (US1/US2/US3) can begin until Phase 2 is complete.

- [X] T002 [P] Create domain entity `src/domain/entities/FrameworkHistoryEntry.js` per `data-model.md` (immutable; constructor enforces non-empty content after trim, UTF-8 byte length ≤ 61440 via `Buffer.byteLength(content, 'utf8')`, `source ∈ {edit, restore}`, `restoreOfRowKey` consistency with `source`, `changeNote` ≤ 280 chars after trim with empty→null normalization). Throw `DomainError` / `ValidationError` from `src/shared/errors`.
- [X] T003 [P] Unit test `tests/unit/domain/entities/FrameworkHistoryEntry.test.js` covering: valid construction, empty-content rejection, 60 KB boundary (just under accepts, just over rejects), multi-byte UTF-8 byte counting (em-dash + accented chars), `source` enum, `restoreOfRowKey` consistency rule, `changeNote` trim + length cap.
- [X] T004 [P] Create interface `src/application/interfaces/IFrameworkRepository.js` declaring the five methods used by the use-cases: `getActive() → { content, historyRowKey, updatedAt } | null`, `saveActive({ content, changeNote, source, restoreOfRowKey }) → FrameworkHistoryEntry`, `listHistory({ limit }) → FrameworkHistoryEntry[]` (newest-first, content omitted from list rows — store byte length only), `getHistoryEntry(rowKey) → FrameworkHistoryEntry | null`, `historyEntryCount() → number` (used by no-op detection paths and tests).
- [X] T005 Update `src/application/interfaces/index.js` to export `IFrameworkRepository`.
- [X] T006 Implement `src/infrastructure/repositories/AzureFrameworkRepository.js` extending `IFrameworkRepository`. Mirror the lazy-init pattern from `AzureSettingsRepository.js` and `AzureAnalysisRepository.js`. Behavior:
  - `getActive()`: read `portfolioSettings` row `partitionKey='settings', rowKey='analysis.strategicFrameworkV1'`; return `{ content: entity.value, historyRowKey: entity.historyRowKey ?? null, updatedAt: entity.updatedAt ?? null }`; null on 404.
  - `saveActive({ content, changeNote, source, restoreOfRowKey })`: compute rowKey as `(9999999999999 - Date.now()).toString().padStart(13, '0') + '-' + crypto.randomBytes(2).toString('hex')`; `createEntity` on `portfolioFrameworkHistory` (PartitionKey='framework'); then `upsertEntity('Merge')` on the settings row to update `value`, `historyRowKey`, `updatedAt`. Return a fully-hydrated `FrameworkHistoryEntry`.
  - `listHistory({ limit })`: `listEntities({ filter: "PartitionKey eq 'framework'" })`, iterate, take first N (the descending-prefix rowKey makes results naturally newest-first). Map each entity to a `FrameworkHistoryEntry`-shaped object **with `content` replaced by `contentBytes = Buffer.byteLength(entity.content, 'utf8')`** to keep the list payload small.
  - `getHistoryEntry(rowKey)`: `getEntity('framework', rowKey)`; null on 404; return full `FrameworkHistoryEntry`.
- [X] T007 Update `src/infrastructure/repositories/index.js` to export `AzureFrameworkRepository`.
- [X] T008 Register `getFrameworkRepository()` singleton in `src/application/di/container.js`, mirroring `getSettingsRepository()` (single-instance, lazy AzureTableDatabase wiring). Do NOT wire use-cases yet — those are added in their respective story phases.

**Checkpoint**: Foundation ready. The repository can be exercised in isolation; user-story phases can begin.

---

## Phase 3: User Story 1 - Edit and save the strategic framework from the dashboard (Priority: P1) 🎯 MVP

**Goal**: The owner can open `/framework`, see the active framework, edit it, and save. The new content takes effect in the next weekly analysis. Empty / oversized / no-op saves are handled correctly (FR-004, FR-011, FR-017).

**Independent Test**: Run quickstart steps 1–6. Open `/framework`, edit, save, refresh — change persists. Trigger a weekly analysis — prompt contains the new content. Try empty save → rejected. Try >60 KB → save button disabled. Click Save with no changes → 200 + `noop: true`, no history row added.

### Tests for User Story 1

- [X] T009 [P] [US1] Unit test `tests/unit/application/use-cases/framework/SaveFramework.test.js` covering: successful save creates history entry + updates active, empty content rejected (FR-004), >60 KB rejected (FR-017), no-op detection returns `{ noop: true, historyRowKey }` without writing (FR-011), normalization (CRLF→LF + trim) before equality comparison, `changeNote` empty-after-trim normalized to null, `source: 'edit'` default when caller doesn't specify.
- [X] T010 [P] [US1] HTTP smoke test `tests/integration/functions/framework.test.js` (scaffold the file with just the GET `/api/framework` + PUT `/api/framework` cases for US1; US2/US3 cases extend this file in their phases). Mock the repository at the DI boundary; assert response shapes from `contracts/api.md` §1 and §2 (including the `noop: true` case and the validation error envelopes).

### Implementation for User Story 1

- [X] T011 [US1] Create `src/application/use-cases/framework/GetActiveFramework.js` extending `UseCase`. `execute()` calls `frameworkRepository.getActive()` and returns `{ content, historyRowKey, updatedAt, maxBytes: 61440 }`. If repo returns null (settings row missing), throw `NotFoundError('strategic framework not configured')`.
- [X] T012 [US1] Create `src/application/use-cases/framework/SaveFramework.js` extending `UseCase`. `execute({ content, changeNote, source = 'edit', restoreOfRowKey = null })`:
  1. Validate `content` non-empty after trim → `ValidationError('content is required')`.
  2. Validate `Buffer.byteLength(content, 'utf8') ≤ 61440` → `ValidationError('content exceeds maximum size of 61440 bytes (got NNNNN)')`.
  3. Validate `changeNote` (if provided) trimmed length ≤ 280 → `ValidationError('changeNote exceeds 280 characters')`.
  4. Read current active via `frameworkRepository.getActive()`. Normalize both sides (`.replace(/\r\n/g, '\n').trim()`) and compare. If equal → return `{ historyRowKey: active.historyRowKey, timestamp: active.updatedAt, noop: true }` without writing.
  5. Otherwise call `frameworkRepository.saveActive(...)` and return `{ historyRowKey: entry.id, timestamp: entry.timestamp, noop: false }`.
- [X] T013 [US1] Create `src/application/use-cases/framework/index.js` exporting `GetActiveFramework` and `SaveFramework`. Update `src/application/use-cases/index.js` to re-export them.
- [X] T014 [US1] Wire `getGetActiveFramework()` and `getSaveFramework()` in `src/application/di/container.js` (singleton use-case instances, dependency-injected with `getFrameworkRepository()`).
- [X] T015 [US1] Create HTTP module `src/functions/framework.js` registering two routes via `app.http(...)`: `GET framework` (`authLevel: 'function'`, invokes `getGetActiveFramework()`, returns 200 with `GetActiveFramework` result or 404 via `mapError`) and `PUT framework` (`authLevel: 'function'`, parses body, invokes `getSaveFramework()` with `{ content, changeNote }`, returns 200 with the use-case result). Use the existing `ok` / `mapError` helpers from `src/functions/_shared.js`.
- [X] T016 [US1] Register the new module in `src/functions/index.js` (the file that aggregates `require()` of each function module).
- [X] T017 [US1] Create Astro page `dashboard/src/pages/framework.astro`. Layout: header ("Strategic framework"), `<textarea>` pre-populated via `await api('/framework')` on load with monospace font + min-height ~50vh, change-note `<input>`, live byte counter `<span>` (`new TextEncoder().encode(value).byteLength`), Save button (disabled when content is empty or bytes > 61440 or content === lastSaved), "Last saved: <timestamp>" indicator, success/error toast region. History section is a placeholder for US2. Reuse `dashboard/src/lib/api.js` and `dashboard/src/lib/format.js`. Pass `active="framework"` to `<Layout>`.
- [X] T018 [US1] Extend `dashboard/src/layouts/Layout.astro`: add `'framework'` to the `active` union type on line 6, append `{ id: 'framework', label: 'Framework', href: '/framework' }` to the `navItems` array (place after `analysis` and before `settings` to mirror logical grouping).

**Checkpoint**: User Story 1 (MVP) shippable. Owner can edit + save through the dashboard; analysis runs use new content; seed script flow can be retired.

---

## Phase 4: User Story 2 - View change history (Priority: P2)

**Goal**: The owner can view all past framework versions, ordered newest-first, with timestamps and change notes, and inspect any past version's full content read-only.

**Independent Test**: Run quickstart step 7. After making 3 distinct saves, open `/framework`; the History section lists 3 entries newest-first. Click any entry — full content expands inline.

### Tests for User Story 2

- [ ] T019 [P] [US2] Unit test `tests/unit/application/use-cases/framework/ListFrameworkHistory.test.js` covering: returns entries newest-first (use mock repo returning seeded entries in arbitrary order — assert ordering after use-case), default limit (50), max-limit clamp (200), zero entries returns empty array (no error — FR-013), passes through repo's `contentBytes` instead of full content.
- [ ] T020 [P] [US2] Extend `tests/integration/functions/framework.test.js` with cases for `GET /api/framework/history` (default + with `?limit=N` + over-cap rejection) and `GET /api/framework/history/{rowKey}` (200 with full content + 404 for unknown rowKey). Match shapes from `contracts/api.md` §3 and §4.

### Implementation for User Story 2

- [ ] T021 [US2] Create `src/application/use-cases/framework/ListFrameworkHistory.js` extending `UseCase`. `execute({ limit })`: validate `limit` is integer in `[1, 200]` (default 50) → `ValidationError('limit must be between 1 and 200')`; call `frameworkRepository.listHistory({ limit })`; return `{ entries, count: entries.length }`. Entries already carry `contentBytes` per T006.
- [ ] T022 [US2] Create `src/application/use-cases/framework/GetFrameworkHistoryEntry.js` extending `UseCase`. `execute({ rowKey })`: validate non-empty; call `frameworkRepository.getHistoryEntry(rowKey)`; if null → `NotFoundError('history entry not found')`; else return entry (with full content).
- [ ] T023 [US2] Update `src/application/use-cases/framework/index.js` and `src/application/use-cases/index.js` to re-export the two new use-cases. Wire `getListFrameworkHistory()` and `getGetFrameworkHistoryEntry()` in `src/application/di/container.js`.
- [ ] T024 [US2] Extend `src/functions/framework.js` with two routes: `GET framework/history` (parse `?limit=N` via `request.query.get('limit')` with default-50 fallback; invoke list use-case) and `GET framework/history/{rowKey}` (read `request.params.rowKey`; invoke fetch use-case). Both `authLevel: 'function'`. Use `ok` / `mapError`.
- [ ] T025 [US2] Add a "History" section to `dashboard/src/pages/framework.astro`. On mount call `api('/framework/history?limit=50')`; render a list of rows (timestamp + change note + source tag + `contentBytes` badge). Clicking a row toggles inline expansion that fetches `api('/framework/history/<rowKey>')` once (cache result client-side) and shows a read-only `<pre>` or `<textarea readonly>` with the full content. Empty-state copy when `count === 0`: "No history yet — your first save will appear here. (Active framework: seeded, no history row.)"

**Checkpoint**: User Story 2 shippable. History audit trail visible; past versions inspectable.

---

## Phase 5: User Story 3 - Restore a previous version (Priority: P3)

**Goal**: From the history view, the owner can restore any past version with one click + a confirm. The restore creates a new history entry tagged `source: 'restore'` (append-only).

**Independent Test**: Run quickstart step 8. Make V1 + V2 saves (V2 active). From history, expand V1, click Restore → confirm. Active framework now equals V1 content; new history entry appears at top tagged "Restored from {V1 timestamp}". V2's row still present.

### Tests for User Story 3

- [ ] T026 [P] [US3] Unit test `tests/unit/application/use-cases/framework/RestoreFrameworkVersion.test.js` covering: target rowKey not found → `NotFoundError`, successful restore writes a new entry with `source: 'restore'` and correct `restoreOfRowKey`, default change note format ("Restored from <ISO>"), custom change note overrides default, restore where target content equals current active → no-op (`{ noop: true }`), append-only invariant (original entry unchanged after restore).
- [ ] T027 [P] [US3] Extend `tests/integration/functions/framework.test.js` with `POST /api/framework/history/{rowKey}/restore` cases: 200 with new history row, 200 with `noop: true` when target equals active, 404 for unknown rowKey, 400 for over-long change note.

### Implementation for User Story 3

- [ ] T028 [US3] Create `src/application/use-cases/framework/RestoreFrameworkVersion.js` extending `UseCase`. `execute({ rowKey, changeNote })`:
  1. `target = await frameworkRepository.getHistoryEntry(rowKey)` — null → `NotFoundError('history entry not found')`.
  2. Build `effectiveNote = changeNote?.trim() || \`Restored from \${target.timestamp}\``.
  3. Delegate to `saveFramework.execute({ content: target.content, changeNote: effectiveNote, source: 'restore', restoreOfRowKey: rowKey })`.
  4. Return the use-case result augmented with `restoreOfRowKey: rowKey` (the save call already carries source/restoreOf metadata, but the API contract surfaces it on the response).
- [ ] T029 [US3] Update `src/application/use-cases/framework/index.js` and `src/application/use-cases/index.js` to re-export `RestoreFrameworkVersion`. Wire `getRestoreFrameworkVersion()` in `src/application/di/container.js` (inject `getSaveFramework()` and `getFrameworkRepository()`).
- [ ] T030 [US3] Extend `src/functions/framework.js` with `POST framework/history/{rowKey}/restore` (`authLevel: 'function'`). Parse `request.params.rowKey` and optional `{ changeNote }` body; invoke restore use-case; return 200 with `{ historyRowKey, timestamp, restoreOfRowKey, noop }`.
- [ ] T031 [US3] Add a "Restore" button inside each expanded history entry in `dashboard/src/pages/framework.astro`. Clicking opens a small confirm dialog ("Restore framework to this version? A new history entry will be created. This cannot be undone."). On confirm, POST to `/framework/history/<rowKey>/restore`; on success, re-fetch active + history and surface a toast (`"Restored — new entry: <timestamp>"` or `"Already active — no new entry created"` if `noop: true`).

**Checkpoint**: User Story 3 shippable. All three priority slices complete.

---

## Phase 6: Analysis traceability (FR-015, FR-016) — Cross-Cutting

**Purpose**: Persist + display the framework history rowKey on each generated analysis. Independent of US1/US2/US3 shipping order, but most useful once history exists (so the badge links somewhere meaningful). Can be parallelized with US2/US3.

**Independent Test**: Run quickstart step 9. Save a framework, trigger a weekly analysis. The analysis row in Azurite has a `frameworkHistoryRowKey` property. The Analysis dashboard page shows a "Framework version: <timestamp>" badge that links to the matching history entry. Pre-feature analysis rows (no rowKey) display "(pre-history seed)".

- [ ] T032 [P] Extend `src/domain/entities/WeeklyAnalysis.js` constructor to accept and expose optional `frameworkHistoryRowKey` (default null). No validation beyond "string or null". Update related JSDoc.
- [ ] T033 Modify `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`: at the existing framework-read site (around line 130 — `_readSettingRaw(frameworkKey)`), also read the active framework's `historyRowKey` via `frameworkRepository.getActive()` (inject via constructor — add to deps). Capture as `frameworkHistoryRowKey` (may be null for pre-feature seed). Pass it through to `WeeklyAnalysis` construction and into the analysis save call. Update the failure-branch `_persistFailed` likewise so failed runs also carry the rowKey when known.
- [ ] T034 Modify `src/infrastructure/repositories/AzureAnalysisRepository.js`: in `save()`, include `frameworkHistoryRowKey` in the entity payload when non-null. In `_analysisFromEntity()`, read `entity.frameworkHistoryRowKey ?? null` and pass to the entity constructor.
- [ ] T035 [P] Unit test `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js` — extend existing test (or add focused cases) covering: rowKey from `frameworkRepository.getActive()` is captured at run start and passed through to repo.save, snapshot-at-start semantics (mid-execution mutations to the mock repo's `getActive` do NOT change the rowKey written), pre-history-seed case (`getActive` returns `{ historyRowKey: null }`) → analysis row is written with `frameworkHistoryRowKey: null` (not undefined, not omitted).
- [ ] T036 Update analysis HTTP responses in `src/functions/getWeeklyAnalysis.js` and `src/functions/getWeeklyAnalysisList.js` so the JSON envelope includes `frameworkHistoryRowKey` for each item / detail.
- [ ] T037 Update Astro analysis pages (`dashboard/src/pages/analysis.astro` list and `dashboard/src/pages/analysis-detail.astro` detail) to render a small "Framework version: <timestamp> ▾" badge near each analysis. Clicking it navigates to `/framework#<rowKey>` (anchor that the framework page reads on load via `location.hash` and scrolls + auto-expands the matching history entry — small JS in `framework.astro`). For analyses with `frameworkHistoryRowKey === null`, render the badge as "(pre-history seed)" without a link.

**Checkpoint**: Analysis traceability complete. Each future analysis is linked to the exact framework version that produced it; the link is one click for the owner.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T038 [P] Update `scripts/seed-analysis-framework.js` header comment to flag it as a one-time bootstrap script — note that the supported edit path is now the dashboard `/framework` page and the script should only be used for environments that have never been seeded. Do not delete the script (still useful for fresh Azurite resets).
- [ ] T039 [P] Add a brief README pointer (one sentence) in the root `README.md` "Features" section: "Strategic framework is editable from the dashboard (`/framework`) with full version history (see `specs/004-editable-strategic-framework/`)." Match the style of the existing pointers (e.g., the weekly analysis pointer added by 002).
- [ ] T040 Run `quickstart.md` end-to-end against Azurite and a clean dashboard build. Confirm steps 1–10. Fix any drift between contract and implementation.
- [ ] T041 Self-review the full diff for Privacy First violations (Constitution I): no real framework content checked in, no real PPCs/symbols in test fixtures, no Azure resource names in code. Confirm `scripts/analysis-framework.local.md` remains gitignored and untouched.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** — depends on nothing. Single task; run first.
- **Phase 2 (Foundational)** — depends on Phase 1. Blocks Phases 3, 4, 5, 6.
- **Phase 3 (US1)** — depends on Phase 2. Independent of US2/US3/Phase 6.
- **Phase 4 (US2)** — depends on Phase 2. Can ship after Phase 3 even if Phase 6 is incomplete.
- **Phase 5 (US3)** — depends on Phase 2 AND Phase 3 (restore wraps `SaveFramework` from US1).
- **Phase 6 (Analysis traceability)** — depends on Phase 2 (needs the repo). Can run in parallel with US2/US3.
- **Phase 7 (Polish)** — depends on all desired user-story phases. Run last.

### Cross-Phase Task Dependencies (within the order above)

- T011, T012 (US1 use-cases) depend on T006 (repo) and T008 (DI repo singleton).
- T015, T016 (HTTP) depend on T011–T014.
- T018 (Layout) is a one-line change but must land before T017 (page) renders correctly in the nav.
- T021, T022 (US2 use-cases) depend on T006 (`listHistory`, `getHistoryEntry`) and T008.
- T025 (history UI) depends on T024 (history endpoints) and T017 (page exists).
- T028 (Restore use-case) depends on T012 (it injects `SaveFramework`).
- T033 (modify GenerateWeeklyAnalysis) depends on T006 (`getActive` exposes `historyRowKey`) and T008 (DI).
- T034 (modify AzureAnalysisRepository) depends on T032 (entity accepts the field).

### Parallel Opportunities

- T002, T003, T004 in Phase 2 can run in parallel — disjoint files.
- T009, T010 in Phase 3 (tests) can run in parallel with each other (different files); both should be written before T011–T012 start if doing strict TDD.
- T019, T020 in Phase 4 — parallel.
- T026, T027 in Phase 5 — parallel.
- T032 and T035 in Phase 6 — parallel (different files).
- T038 and T039 in Phase 7 — parallel.
- Phases 4, 5, 6 can be executed in parallel by different developers once Phase 3 is checkpoint-complete (note: Phase 5 still depends on Phase 3 for `SaveFramework`).

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Three foundational files can be authored in parallel:
Task: "T002 — Create domain entity src/domain/entities/FrameworkHistoryEntry.js"
Task: "T003 — Unit test tests/unit/domain/entities/FrameworkHistoryEntry.test.js"
Task: "T004 — Create interface src/application/interfaces/IFrameworkRepository.js"
# Then sequentially: T005 (interface index export) → T006 (repo impl) → T007 (repo index export) → T008 (DI wiring)
```

## Parallel Example: Phase 3 (US1) — tests-first

```bash
# Write the tests first (they should fail because use-cases don't exist yet):
Task: "T009 — Unit test SaveFramework.test.js"
Task: "T010 — HTTP smoke test framework.test.js (US1 cases only)"
# Then implement: T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Complete Phase 1 (T001 — one task).
2. Complete Phase 2 (T002–T008 — foundational).
3. Complete Phase 3 (T009–T018 — US1 editor + save).
4. **STOP and VALIDATE**: run quickstart steps 1–6. Editor works; analysis picks up new content; empty/oversized/no-op behaviors correct.
5. Deploy / demo if ready. The seed-script loop is now retired for active editing.

### Incremental delivery

1. Phase 1 + Phase 2 → foundation ready.
2. Phase 3 (US1) → MVP shipped (editor + save). Demo.
3. Phase 4 (US2) → history audit trail shipped. Demo.
4. Phase 5 (US3) → one-click restore shipped. Demo.
5. Phase 6 (analysis traceability) → audit-trail link from each analysis to its framework version. Demo.
6. Phase 7 → polish.

### Parallel team strategy

With multiple developers (post-Phase-2):
- Dev A: Phase 3 (US1) — must finish before Phase 5 starts.
- Dev B: Phase 6 (analysis traceability) — independent of US1/US2/US3, can start immediately after Phase 2.
- Dev C: Phase 4 (US2) — can start after Phase 2.

---

## Notes

- All Azure Functions handlers use `authLevel: 'function'` (FR-010); reuse existing `_shared.js` `ok` / `mapError` helpers.
- All new domain validations throw from `src/shared/errors`. Use `ValidationError` for use-case-level validation (caller-facing) and `DomainError` for entity-level invariants (programmer-error-ish).
- Commit cadence: a logical group per phase or per checkpoint, conventional prefixes (`feat:` / `test:` / `docs:`).
- Do NOT introduce new npm dependencies; the entire feature is implementable with what's already in `package.json` (Node built-ins for `crypto.randomBytes`, `Buffer.byteLength`, `TextEncoder`).
- Privacy First (Constitution I): no real framework content goes into any test fixture or commit. Use placeholders like `## Buckets\n- US — example` in tests.
