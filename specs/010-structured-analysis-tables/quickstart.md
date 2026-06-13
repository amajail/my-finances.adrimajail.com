# Quickstart — Structured Analysis Tables (feature 010)

Goal: seed machine-readable allocation targets, run an analysis, and verify the
new structured tables render and that the guardrail preamble is visible (read-only)
in the instructions editor.

## Prerequisites

- Repo cloned, deps installed (`npm install` at root and in `dashboard/`).
- Azurite running; `local.settings.json` points at it.
- Feature 005 instructions already seeded (`analysis.instructionsV1` active).
- A current strategic framework seeded (`analysis.strategicFrameworkV1`).

## 1. Seed machine-readable allocation targets (new)

```bash
cp scripts/allocation-targets.example.json scripts/allocation-targets.local.json
# Edit allocation-targets.local.json with your REAL buckets/classes/targets/caps.
# This file is gitignored — keep it that way (Privacy First).
node scripts/seed-allocation-targets.js
# Idempotent: skips if analysis.allocationTargetsV1 already exists.
```

Keep these targets consistent with the prose `analysis.strategicFrameworkV1`
(the targets doc drives the computed tables; the prose still guides the LLM).

## 2. Start backend + dashboard

```bash
npm start                      # Functions on http://localhost:7071/api
cd dashboard && npm run dev     # dashboard on http://localhost:4321
```

## 3. Verify the guardrail preamble + editing guide

- Open `/instructions` in the dashboard.
- Confirm a **read-only** guardrail preamble block renders above your editable
  body, and an **editing guide** is reachable (collapsible/help panel).
- Confirm you cannot edit or delete the preamble; only the body textarea is
  editable. Save still works on the body alone.
- Sanity-check the API: `GET /api/instructions` now returns `preamble` and
  `editingGuide` in addition to `content`.

## 4. Run an analysis and inspect the tables

```bash
# trigger a run (operator path) or run the timer use-case locally
curl -s -X POST "http://localhost:7071/api/analysis/weekly/run?date=YYYY-MM-DD" | jq .
```

Open `/analysis-detail?date=YYYY-MM-DD` and confirm:

- **Bucket drift** and **Asset-class drift** tables: target %, current %, signed
  drift; over-weight vs under-weight visually distinguished by sign (US1).
- **Concentration caps** table: each cap row with soft/hard limit, current level,
  soft/hard breach badge (US2).
- **Watchlist** table when the model flagged anything (US2).
- **Week-over-week** (analytical) and **Framework amendments** tables when present
  (US3) — visually distinct from the existing position-changes table.
- The **Narrative** no longer restates those tables (FR-009).

## 5. Degradation checks

- Open a **pre-feature** analysis (one generated before this feature): the new
  tables are simply absent; narrative + the feature-006/007 sections render as
  before; no errors, no empty shells (SC-004).
- Temporarily remove/rename `analysis.allocationTargetsV1` and run: drift/cap
  tables are omitted, the LLM sections + narrative still render, the run does not
  fail solely for missing targets (Edge: framework targets unavailable).

## 6. Tests

```bash
npm test    # AllocationDriftCalculator (drift + caps math, membership, unclassified),
            # WeeklyAnalysis validation (new optional fields), repo round-trip.
```
