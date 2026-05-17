# Implementation Plan: Editable Strategic Framework

**Branch**: `feature/editable-strategic-framework` | **Date**: 2026-05-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-editable-strategic-framework/spec.md`

## Summary

Move the strategic framework prompt (today: gitignored `scripts/analysis-framework.local.md`, seeded by a manual script into the existing `portfolioSettings` row `analysis.strategicFrameworkV1`) into a dashboard-editable workflow with append-only version history. The active framework keeps its existing home in `portfolioSettings` so `GenerateWeeklyAnalysis` continues to read it via the existing snapshot-at-entry path (FR-014). Every save through the new UI also writes an immutable row to a **new** `portfolioFrameworkHistory` table — that row's key is then stamped onto the `portfolioSettings` row (and, going forward, onto each `portfolioAnalysis` row, FR-015) so any past analysis can be traced back to the exact framework version that produced it. A new top-level dashboard route (`/framework`) hosts editor + history + one-click restore (P3). 60 KB UTF-8 cap enforced server-side and mirrored in the editor (FR-017). Write endpoints reuse the existing `authLevel: 'function'` operator gating (FR-010); no new auth surface.

## Technical Context

**Language/Version**: Node.js ≥ 18 (existing Azure Functions runtime); JavaScript (CommonJS, matching repo convention).

**Primary Dependencies**:
- Existing: `@azure/functions@^4.5`, `@azure/data-tables@^13.3`, Astro (dashboard), Jest (tests).
- **No new runtime dependencies.** Both backend and dashboard work is additive to existing packages.

**Storage**: Azure Table Storage via `@azure/data-tables`. One new table — `portfolioFrameworkHistory`. The existing `portfolioSettings` row `settings/analysis.strategicFrameworkV1` is amended to carry two new properties: `historyRowKey` and `updatedAt`. The existing `portfolioAnalysis` row schema gains one optional property: `frameworkHistoryRowKey` (FR-015).

**Testing**: Jest. Unit tests for `FrameworkHistoryEntry` (validation: non-empty, 60 KB cap), the new use-cases (`GetActiveFramework`, `SaveFramework` with no-op detection, `ListFrameworkHistory`, `GetFrameworkHistoryEntry`, `RestoreFrameworkVersion`), HTTP smoke tests for the five new endpoints. No e2e/browser tests for the editor UI (consistent with repo's "UI is exempt unless it encodes business rules" stance in Constitution IV).

**Target Platform**: Azure Functions (Linux Consumption plan); Azure Static Web Apps for the Astro dashboard. Local dev: function host on `localhost:7071`, Azurite for tables.

**Project Type**: Web service — backend Azure Functions + frontend Astro SPA.

**Performance Goals**: Save round-trip < 500 ms p95 (single table write + single settings upsert). History list render < 1 s for up to ~500 entries (single-partition scan; row count grows by ~1/week in steady state). Editor handles 60 KB content without input lag in mainstream browsers.

**Constraints**:
- **Append-only history** (FR-009): no UI path may delete or mutate a history row.
- **60 KB cap** (FR-017): UTF-8 byte length, enforced server-side; mirrored in the editor with a live counter.
- **No-op detection** (FR-011): saves whose trimmed content matches the current active framework byte-for-byte must NOT create a history entry; the API returns a `noop: true` flag and the existing `historyRowKey` unchanged.
- **Snapshot-at-start** (FR-014): the existing `GenerateWeeklyAnalysis` already reads the framework once at run entry (see `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:130`). No change needed for the *semantics*; the only change is that the use-case now also captures `historyRowKey` from the same read and persists it on the analysis row.
- **Operator-only writes** (FR-010): all write endpoints use `authLevel: 'function'`, matching `settings.js`, `prices/refresh`, etc.
- **Privacy First (Constitution I)**: framework content already lives in `portfolioSettings` (which is gitignored at the level of any seed file). No new external egress path; no new log sink.

**Scale/Scope**: Single owner. Framework saves: a few per week at most → ~52 history rows/year baseline, ~250 with active maintenance. Row size: up to 60 KB content + ~1 KB metadata. Per-year storage: well under 20 MB; trivial.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Privacy First (NON-NEGOTIABLE) | ✅ Compliant | Framework content already lives in `portfolioSettings`. New table `portfolioFrameworkHistory` stores the same kind of content in the same database, behind the same operator-only function-key gate. **No new external egress**, no new third-party service, no new log sink. The framework markdown is the owner's own strategic doc; it is not market data and contains no PPCs/quantities directly (it references *symbols*, not holdings). Source-control prohibition remains in force — nothing about this feature stages real framework content into git. |
| II. Clean Architecture / DDD | ✅ Compliant | New domain entity `FrameworkHistoryEntry` in `src/domain/entities/`; new interface `IFrameworkRepository` in `src/application/interfaces/`; five new use-cases under `src/application/use-cases/framework/`; implementation `AzureFrameworkRepository` in `src/infrastructure/repositories/`; thin HTTP handlers in a new `src/functions/framework.js`. Function handlers parse → use-case → format response, with zero business logic in `src/functions/`. |
| III. Idempotent Data Operations | ✅ Compliant | Append-only history is idempotency-friendly by construction. No-op detection (FR-011) prevents identical-content double-clicks from polluting history. Restore (FR-008) writes a *new* entry rather than mutating; pre-existing seeded content is read-only from the framework UI's perspective (no retroactive backfill, per spec assumption). |
| IV. Pragmatic Testing | ✅ Compliant | Tests where they pay off: entity validation (size cap, non-empty), use-case orchestration (no-op detection, restore semantics, list ordering), HTTP smoke tests (status codes + JSON shape). The Astro editor UI is exempt per the constitution's UI exemption — manual quickstart covers it. |
| V. Convention-Driven Workflow | ✅ Compliant | Already on `feature/editable-strategic-framework`. SDD pipeline: specify ✅ → clarify ✅ (5 questions answered, recorded in `spec.md` Clarifications) → plan (this file) → tasks → analyze → implement. Commit prefixes will be `feat:` / `test:` / `docs:`. |

**Gate result**: PASS. No carve-outs needed. The one structural addition (new table) is captured in Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/004-editable-strategic-framework/
├── spec.md                     # /speckit-specify + /speckit-clarify output
├── plan.md                     # This file
├── research.md                 # Phase 0 — design-decision rationale
├── data-model.md               # Phase 1 — table schema + entity shape
├── quickstart.md               # Phase 1 — local dev + manual test recipe
├── contracts/
│   └── api.md                  # HTTP endpoint contracts (5 endpoints)
├── checklists/
│   └── requirements.md         # /speckit-specify quality checklist (already exists)
└── tasks.md                    # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── entities/
│       └── FrameworkHistoryEntry.js                    (NEW — validation: non-empty, 60 KB UTF-8 cap)
├── application/
│   ├── interfaces/
│   │   ├── IFrameworkRepository.js                     (NEW)
│   │   └── index.js                                    (MODIFY — export new interface)
│   ├── use-cases/
│   │   ├── index.js                                    (MODIFY — export new use-cases)
│   │   └── framework/
│   │       ├── index.js                                (NEW)
│   │       ├── GetActiveFramework.js                   (NEW)
│   │       ├── SaveFramework.js                        (NEW — validation + no-op detection)
│   │       ├── ListFrameworkHistory.js                 (NEW)
│   │       ├── GetFrameworkHistoryEntry.js             (NEW)
│   │       └── RestoreFrameworkVersion.js              (NEW — delegates to SaveFramework with source='restore')
│   └── di/
│       └── container.js                                (MODIFY — register IFrameworkRepository + 5 use-cases)
├── infrastructure/
│   └── repositories/
│       ├── AzureFrameworkRepository.js                 (NEW — owns portfolioFrameworkHistory + writes active settings row)
│       └── index.js                                    (MODIFY — export new repo)
├── database/
│   └── AzureTableDatabase.js                           (MODIFY — add frameworkHistoryClient + table to initialize loop)
├── functions/
│   ├── framework.js                                    (NEW — 5 HTTP handlers)
│   └── index.js                                        (MODIFY — register new function module)
├── application/use-cases/analysis/
│   └── GenerateWeeklyAnalysis.js                       (MODIFY — capture historyRowKey alongside framework read; pass to repo)
└── infrastructure/repositories/
    └── AzureAnalysisRepository.js                      (MODIFY — persist + return frameworkHistoryRowKey on analysis rows)

dashboard/
└── src/
    ├── layouts/
    │   └── Layout.astro                                (MODIFY — add 'framework' to active union + navItems list)
    ├── pages/
    │   └── framework.astro                             (NEW — top-level route; editor + history list + restore, single page)
    └── lib/
        └── api.js                                      (reused — no changes)

tests/
└── unit/
    ├── domain/entities/
    │   └── FrameworkHistoryEntry.test.js               (NEW)
    └── application/use-cases/framework/
        ├── SaveFramework.test.js                       (NEW — covers no-op, size cap, empty rejection, restore source tagging)
        ├── ListFrameworkHistory.test.js                (NEW — covers newest-first ordering, limit)
        └── RestoreFrameworkVersion.test.js             (NEW — covers append-only behavior, restoreOf metadata)

tests/integration/functions/
└── framework.test.js                                   (NEW — HTTP smoke for 5 endpoints)

CLAUDE.md                                               (MODIFY — update SPECKIT marker to point at this plan)
```

**Structure Decision**: Web-service layout already established by 002. This feature slots in additively — one new table, one new infra repo, one new domain entity, five new use-cases (mostly small), one new HTTP module, one new Astro page, one nav entry. The two `MODIFY` edits to existing analysis files (`GenerateWeeklyAnalysis.js`, `AzureAnalysisRepository.js`) are narrow: pass + persist one extra property (`frameworkHistoryRowKey`) on the analysis save path so future analyses are traceable to the framework version that produced them (FR-015).

## Complexity Tracking

| Violation / Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **New table `portfolioFrameworkHistory`** | FR-005, FR-009: history must be immutable, append-only, and queryable newest-first. A separate table gives clean append-only semantics, natural time-ordered scans (single partition + ISO-timestamp-based rowKey), and isolates history-row growth from the much-smaller settings table. | Stuffing history rows into `portfolioSettings` with composite RowKeys (`framework.v1.history.{timestamp}`) would conflate two concerns (point-in-time lookups vs. history scans), make `getAll` on settings slower over time, and complicate "active vs history" reads. Rejected. |
| **New `frameworkHistoryRowKey` property on `portfolioAnalysis` rows** | FR-015, FR-016 require each generated analysis to record which framework version produced it. The row gains one optional string property — Azure Tables tolerates schema-on-write so no migration is needed. Existing rows pre-feature simply lack the property (rendered as "(seeded)" in UI). | Storing the *full framework content* on each analysis row would duplicate up to 60 KB per analysis — wasteful and inconsistent (multiple sources of truth for the same version). Rejected. Cross-table join via `frameworkHistoryRowKey` is the simpler model. |

No other deviations. No new npm dependencies; no new external service; no new auth surface; no schema migration required for existing tables.

## Phase 0 — Outline & Research

See [research.md](./research.md) for full notes. Topics resolved there:

1. **R1 — RowKey format for history entries**: lexicographically descending timestamp prefix (`9999999999999 - epochMs` zero-padded) so `listEntities` returns newest-first by default; suffix with a short random nonce to guarantee uniqueness if two saves land in the same millisecond.
2. **R2 — Atomic save semantics**: write history row first, then upsert `portfolioSettings` row with the new `historyRowKey`. Sequence keeps the active framework pointing only at a row that actually exists; transient failure between the two writes leaves a harmless "orphan" history row that is still readable but not active.
3. **R3 — No-op detection** (FR-011): compare normalized (trim + LF-normalize) content against current active content **inside** `SaveFramework` before any write. Return `{ noop: true, historyRowKey: <existing> }`.
4. **R4 — 60 KB enforcement** (FR-017): UTF-8 byte length via `Buffer.byteLength(content, 'utf8')`. Enforced in the `FrameworkHistoryEntry` constructor (domain) AND echoed by the use-case for early-failure clarity. The editor mirrors via `new TextEncoder().encode(value).byteLength`.
5. **R5 — Restore semantics** (FR-008): `RestoreFrameworkVersion` is a thin wrapper that reads the target history entry, then invokes `SaveFramework` with `{ content, changeNote: 'Restored from {timestamp}', source: 'restore', restoreOfRowKey }`. Append-only by construction.
6. **R6 — Pre-existing seeded content** (FR-013, FR-015): the settings row currently has no `historyRowKey`. `GetActiveFramework` returns `historyRowKey: null` in that case; the UI labels it "(seeded — no history)". The first UI save creates the first history entry and populates `historyRowKey` going forward.
7. **R7 — Editor UX (single page vs. two routes)**: a single Astro page (`/framework`) hosts both the editor and a collapsible history list. Selecting a history entry expands an inline read-only viewer with a Restore button. Avoids the dynamic-route + query-string dance the analysis pages use (`analysis-detail.astro` workaround). One route to deploy, one page to test.

## Phase 1 — Design & Contracts

**Outputs produced (this directory):**
- [`data-model.md`](./data-model.md) — `FrameworkHistoryEntry` entity, `portfolioFrameworkHistory` table schema, amended `portfolioSettings` and `portfolioAnalysis` properties.
- [`contracts/api.md`](./contracts/api.md) — Five HTTP endpoints with request/response shapes and status codes.
- [`quickstart.md`](./quickstart.md) — Local dev recipe: how to migrate from the seed-script flow, how to verify save/history/restore manually against Azurite + the Astro dev server.
- **CLAUDE.md** updated between `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` to point at this plan.

**Constitution re-check post-design**: still PASS. The Phase 1 artifacts introduce no new principles, no new external dependencies, no new privacy surface. The two existing-file modifications (`GenerateWeeklyAnalysis.js`, `AzureAnalysisRepository.js`) are narrow and additive — they preserve current behavior on the read path and add one optional column on the write path.

---

**Phase 2 (tasks.md)** is produced by `/speckit-tasks`, not by this command. This plan stops here.
