# Implementation Plan: Dashboard Metrics Trim

**Branch**: `feature/003-dashboard-metrics-trim` | **Date**: 2026-05-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-dashboard-metrics-trim/spec.md`

## Summary

Trim each per-broker positions table on the home dashboard down to four columns — **Symbol**, **Value**, **P&L**, **%** — by removing the **Quantity**, **PPC (average cost)**, and **Last (current price)** columns; remove the corresponding sort handles; default-sort each table by **Value descending** on first render; and do nothing else (no tooltip / popover / expand-on-click fallback for the removed values; the Positions page remains the place to see them).

This is a localized UI change confined to one file: `dashboard/src/lib/portfolio-page.js`. No backend, API, or data-model changes. No new dependencies.

## Technical Context

**Language/Version**: JavaScript (browser) inside an Astro 4.x dashboard. The single file touched (`dashboard/src/lib/portfolio-page.js`) is vanilla ES modules — no framework.

**Primary Dependencies**: None changed. Existing imports (`api.js`, `format.js`, `pricing.js`) are reused as-is.

**Storage**: N/A — the change is render-only. The `/api/positions` and `/api/portfolio/summary` responses are unchanged.

**Testing**: Per Constitution Principle IV (Pragmatic Testing), frontend visual UI is exempt unless it encodes business rules. This change is presentation-only — no test additions required. Verification is by manual smoke check against `quickstart.md`.

**Target Platform**: Modern evergreen browser running the static-built dashboard. No mobile-specific work in this feature.

**Project Type**: Web application (existing layout: Azure Functions backend + Astro frontend). This feature lives entirely on the frontend.

**Performance Goals**: No new perf targets. Rendering ≤ 4 columns instead of 7 is strictly cheaper than today; no measurable regression expected.

**Constraints**: Preserve all current behavior outside the per-broker positions tables (FR-007). Preserve the existing computation, units, currency handling, and gain/loss color cue (FR-005, FR-006). Do **not** expose removed values via tooltip/popover/expand (FR-002).

**Scale/Scope**: A single user, a handful of brokers, tens of positions per broker. No scale work warranted.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Privacy First (NON-NEGOTIABLE) | ✅ Pass | No real holdings data is hard-coded into source. The change touches presentation logic only; no fixtures, no example values. `quickstart.md` uses obvious placeholder symbols. |
| II. Clean Architecture / DDD | ✅ Pass | Frontend rendering layer only. No domain entities, value objects, repositories, or use-cases touched. No business rules moved into UI code. |
| III. Idempotent Data Operations | ✅ Pass | No data ops in this feature. `scripts/seed-positions.js` is untouched. |
| IV. Pragmatic Testing | ✅ Pass | UI-only change, exempt from required tests per the principle's "frontend visual UI and one-off scripts are exempt unless they encode business rules" clause. The computation functions in `pricing.js` (which already power Value/P&L/%) are unchanged. |
| V. Convention-Driven Workflow | ✅ Pass | Branch is `feature/003-dashboard-metrics-trim` (slug carries the speckit numeric prefix so prereq scripts resolve cleanly). The feature is moving through the spec → clarify → plan → tasks → analyze → implement pipeline. Commits will use `feat:` / `docs:` prefixes. |

No violations. Complexity Tracking table below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-dashboard-metrics-trim/
├── plan.md                  # This file (/speckit-plan output)
├── spec.md                  # Feature spec (/speckit-specify + /speckit-clarify output)
├── research.md              # Phase 0 — decisions captured from spec + existing code reading
├── data-model.md            # Phase 1 — view-model for the trimmed row (no DB changes)
├── quickstart.md            # Phase 1 — manual verification steps
├── checklists/
│   └── requirements.md      # Spec quality checklist (/speckit-specify output)
└── tasks.md                 # Phase 2 — /speckit-tasks output (not produced here)
```

No `contracts/` directory: this feature exposes no new external interface. The dashboard continues to consume the existing `/api/positions` and `/api/portfolio/summary` endpoints with their existing shapes.

### Source Code (repository root)

```text
dashboard/
└── src/
    ├── pages/
    │   └── index.astro              # Hosts the empty <section id="positions-by-broker"> — unchanged.
    └── lib/
        ├── portfolio-page.js        # THE ONLY FILE EDITED. Trim columns, change sort defaults, drop accessors.
        ├── format.js                # Unchanged (fmtPct, pnlClass still used).
        ├── pricing.js               # Unchanged (effectivePrice, marketValue, costBasis still used).
        └── api.js                   # Unchanged.

src/                                  # Azure Functions backend — UNCHANGED in this feature.
```

**Structure Decision**: Existing web-application layout. The feature is a surgical edit inside the frontend `dashboard/src/lib/portfolio-page.js`. No new files, no new directories. No backend code or API contract touched.

## Complexity Tracking

> Empty — no Constitution Check violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
