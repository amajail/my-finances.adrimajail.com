# Implementation Plan: Weekly Context Capture (Macro Metrics + Portfolio Totals + Position Changes)

**Branch**: `006-weekly-context-capture` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-weekly-context-capture/spec.md`

## Summary

Extend the weekly rebalance analysis to capture, use, and display the full context each run was
made under: a 9-indicator macro panel (riesgo país, FX gap, BCRA reserves, AR inflation, AR
policy rate, US inflation, US rate, S&P 500 drawdown, IMF review status), the portfolio totals
at run time (USD/ARS totals, unrealized P&L, cost basis, MEP rate), and the exact week-over-week
position changes. All three are persisted immutably on the `WeeklyAnalysis` record, injected into
the AI analyst's user message, and rendered on the analysis detail page. Macro fetches are
individually resilient (one source failing never aborts the run — including riesgo país, which
becomes non-fatal). Technically: add per-source providers behind interfaces, fan them out through
a `MacroContextProvider` orchestrator, add a pure `PositionChangeCalculator`, add a small
Anthropic `classify` call for IMF status (public-news input only), extend the entity + repository
with three JSON columns, and add three rendered blocks. See [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/).

## Technical Context

**Language/Version**: Node.js ≥ 18 (Azure Functions v4); Astro (dashboard).

**Primary Dependencies**: `@azure/data-tables`, `@anthropic-ai/sdk`, native `fetch`. **Target zero
new npm packages** (CSV via line-split, RSS via tolerant string extraction); `fast-xml-parser` is
the only sanctioned fallback if RSS extraction proves brittle (see Complexity Tracking).

**Storage**: Azure Table Storage. Existing `portfolioAnalysis` table extended with 3 JSON columns
(`macroContextJson`, `portfolioTotalsJson`, `positionChangesJson`). No new tables. New settings
keys in `portfolioSettings`: `analysis.fredApiKey`, `analysis.imfModel`, `analysis.imfStalenessWeeks`.

**Testing**: Jest (`test:unit`, `test:integration`); Astro build via `pr-checks.yml`.

**Target Platform**: Azure Functions (Linux) backend + Azure Static Web Apps (dashboard).

**Project Type**: Web (Functions backend + Astro frontend) — existing structure.

**Performance Goals**: Non-interactive weekly timer. Macro fan-out via `Promise.allSettled` with
per-source timeout (~10s, matching existing providers); a hung source cannot stall the run beyond
its timeout. Adds one small Haiku classify call (~cents). No user-facing latency target.

**Constraints**: Constitution Privacy First — new external sources are **inbound reads only** (no
holdings egress); FRED key is a credential (App Setting / `local.settings.json`, never committed);
the IMF classify call carries **only public news** and routes through `LLMLogSanitizer`. Lands
after feature 005 (editable instructions) merges — builds on its analysis pipeline.

**Scale/Scope**: One analysis/week; ~9 small HTTP fetches + 1 small LLM call per run; ~6 new
providers, 1 orchestrator, 1 domain service, entity + repository + 2 HTTP responses + 1 dashboard
page touched.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.1.0.*

| Principle | Status | Notes |
|---|---|---|
| **I. Privacy First (NON-NEGOTIABLE)** | ✅ PASS | New macro sources are inbound reads — no holdings sent. The IMF AI classify call sends **only public IMF news text**, within the authorized Anthropic carve-out, and is sanitized (no prompt/response bodies logged; only metadata/cost). FRED key reaches runtime via App Settings only, never committed (FR-023). Portfolio totals + position changes are now returned by the runtime **API** and rendered — this is runtime egress to the owner's own dashboard, NOT source control or a log sink, so it's outside the prohibition; consistent with suggested orders already returned. All new tests/fixtures use clearly-fake holdings. |
| **II. Clean Architecture / DDD** | ✅ PASS | Providers (infra) implement interfaces (application); orchestrator is a provider/use-case collaborator; `PositionChangeCalculator` is a pure domain service; entity changes in `src/domain`; `GenerateWeeklyAnalysis` stays thin (swaps one fetch for the orchestrator). HTTP functions stay parse→use-case→respond. |
| **III. Idempotent Data Operations** | ✅ PASS | No seed-script changes. `upsert` already replaces an analysis wholesale; new columns ride along. No mutation of existing positions. |
| **IV. Pragmatic Testing** | ✅ PASS | Unit tests for entity validation, `PositionChangeCalculator`, each provider (mocked fetcher), orchestrator resilience, and the IMF carry-forward/staleness logic; integration tests for provider fixtures + repository round-trip. |
| **V. Convention-Driven Workflow** | ✅ PASS (note) | Following the SDD pipeline. Branch is `006-weekly-context-capture` (spec-kit numbered), consistent with in-flight `005-...`; the PR to `main` may use a `feature/{kebab}` name per the branch convention. Any new runtime dep justified below. |

**Gate result: PASS** — no violations requiring Complexity Tracking justification (the one
candidate, an XML parser, is conditional and pre-justified below).

## Project Structure

### Documentation (this feature)

```text
specs/006-weekly-context-capture/
├── plan.md              # This file
├── spec.md              # Feature spec (+ Clarifications)
├── research.md          # Phase 0 — source feasibility + architecture decisions
├── data-model.md        # Phase 1 — entity/value-object/storage model
├── quickstart.md        # Phase 1 — local dev + verification recipe
├── contracts/
│   ├── api.md           # HTTP response additions (detail endpoint)
│   ├── providers.md     # Internal provider interfaces
│   └── imf-classify-tool.json  # Anthropic tool schema for IMF status
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── entities/
│   │   └── WeeklyAnalysis.js          # + macroContext, portfolioTotals, positionChanges
│   └── services/
│       └── PositionChangeCalculator.js # NEW — pure diff(prior, current)
├── application/
│   ├── interfaces/
│   │   ├── IRiesgoPaisProvider.js     # (exists, reused)
│   │   ├── IFxGapProvider.js          # NEW
│   │   ├── IBcraMonetariasProvider.js # NEW
│   │   ├── IInflationProvider.js      # NEW
│   │   ├── IFredProvider.js           # NEW
│   │   ├── ISp500DrawdownProvider.js  # NEW
│   │   ├── IImfStatusProvider.js      # NEW
│   │   └── IMacroContextProvider.js   # NEW (orchestrator)
│   ├── use-cases/analysis/
│   │   └── GenerateWeeklyAnalysis.js  # fetch macro+totals, diff, inject blocks, persist
│   └── di/
│       └── container.js               # wire new providers + orchestrator
├── infrastructure/
│   ├── providers/
│   │   ├── DolarApiFxGapProvider.js   # NEW
│   │   ├── BcraMonetariasProvider.js  # NEW (reserves id 1, policy rate id 160)
│   │   ├── ArgentinaDatosInflationProvider.js # NEW
│   │   ├── FredProvider.js            # NEW (CPIAUCSL pc1, DFEDTARU)
│   │   ├── StooqSp500Provider.js      # NEW
│   │   ├── ImfStatusProvider.js       # NEW (RSS filter + classify + carry-forward)
│   │   └── MacroContextProvider.js    # NEW orchestrator (Promise.allSettled)
│   ├── llm/
│   │   └── AnthropicLLMClient.js      # + classify() method
│   └── repositories/
│       └── AzureAnalysisRepository.js # serialize/deserialize 3 new JSON columns
├── functions/
│   ├── getWeeklyAnalysis.js           # include macroContext, portfolioTotals, positionChanges
│   └── getWeeklyAnalysisList.js       # unchanged this iteration
dashboard/
└── src/pages/analysis-detail.astro    # + 3 rendered blocks (Macro / Totals / Changes)

tests/
├── unit/
│   ├── domain/entities/WeeklyAnalysis.test.js          # new-field validation
│   ├── domain/services/PositionChangeCalculator.test.js # NEW
│   ├── infrastructure/providers/*.test.js              # NEW per provider (mocked fetch)
│   └── application/use-cases/analysis/GenerateWeeklyAnalysis.test.js # macro/totals/diff wiring + resilience
└── integration/
    ├── providers/*.test.js            # fixture-based per source
    └── AzureAnalysisRepository.test.js # round-trip incl. null-vs-[] positionChanges
```

**Structure Decision**: Reuse the existing clean/DDD layout exactly. The only structural
addition is `src/domain/services/` for the pure `PositionChangeCalculator` (a domain service is
the correct home for cross-entity computation). Everything else slots into existing folders and
the DI container, matching the `IRiesgoPaisProvider`/`ArgentinaDatosRiesgoPaisProvider` precedent.

## Complexity Tracking

No constitution violations. One conditional new dependency, pre-justified:

| Item | Why (if) needed | Simpler alternative |
|---|---|---|
| `fast-xml-parser` (conditional) | IMF RSS is XML; if dependency-free `<item>` extraction proves brittle across IMF feed variations during testing, a small, well-maintained parser is warranted. | Default: tolerant string/regex extraction of `<item>` `<title>/<link>/<description>/<pubDate>` — no dependency. Adopt the parser ONLY if tests show the regex approach is unreliable; record the decision in tasks if so. |

## Phase boundary

This plan ends at Phase 1 (design + contracts). Phase 2 (`tasks.md`) is produced by
`/speckit-tasks`. No code is written by `/speckit-plan`.
