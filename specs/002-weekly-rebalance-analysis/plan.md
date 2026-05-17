# Implementation Plan: Weekly LLM Portfolio Rebalance Analysis

**Branch**: `feature/weekly-rebalance-analysis` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-weekly-rebalance-analysis/spec.md`

## Summary

A Friday-evening Azure Function timer that asks Claude (via the Anthropic SDK, with `tool_use` enforcing a structured response) to produce a weekly written rebalance analysis. Inputs to each run: the current portfolio (via existing `GetPortfolioSummary`), the prior week's full analysis record (narrative + suggested orders + persisted per-position portfolio snapshot), and the current Argentina riesgo país reading from `api.argentinadatos.com`. Outputs: one narrative + a list of `buy|sell` suggested orders, persisted to two new Azure Tables (`portfolioAnalysis`, `portfolioOrders`). The Astro dashboard gains a read-only `/analysis` list page and a `/analysis/[date]` detail page (no buttons, no marking, no manual-trigger HTTP endpoint — recovery is via Azure portal Test/Run on the timer). Per-run cost cap, log sanitizer (no prompt/response in Application Insights), and a versioned prompt template living at `src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md` round out the design.

## Technical Context

**Language/Version**: Node.js ≥ 18 (existing Azure Functions runtime); JavaScript (CommonJS, matching repo convention — see `package.json` `"type": "commonjs"`).

**Primary Dependencies**:
- Existing: `@azure/functions@^4.5`, `@azure/data-tables@^13.3`, Astro (dashboard), Jest (tests).
- **New**: `@anthropic-ai/sdk` (Anthropic Node SDK; latest stable at install time). Justified in Complexity Tracking.
- No other new dependencies in the backend. HTTP fetches to `api.argentinadatos.com` use Node's global `fetch` + `AbortController` (existing pattern in `src/infrastructure/providers/CohenPriceProvider.js`).
- **Dashboard-only new deps**: `marked` and `DOMPurify` for client-side markdown rendering (see research R5).

**Storage**: Azure Table Storage via `@azure/data-tables`. Two new tables — `portfolioAnalysis`, `portfolioOrders`. Existing tables (`portfolioBrokers`, `portfolioPositions`, `portfolioSettings`, `portfolioPrices`) are read but not written.

**Testing**: Jest. Unit tests for `WeeklyAnalysis` / `SuggestedOrder` entities (validation), `GenerateWeeklyAnalysis` use-case (orchestration logic with mocked repo + LLM + riesgo-país provider), and HTTP smoke tests for the two read endpoints. Integration test for the riesgo-país provider against a recorded JSON fixture; live integration test gated on `ANTHROPIC_API_KEY` (skipped in CI).

**Target Platform**: Azure Functions (Linux Consumption plan); Azure Static Web Apps for the Astro dashboard. Local dev: function host on `localhost:7071`, Azurite for tables.

**Project Type**: Web service — backend Azure Functions + frontend Astro SPA.

**Performance Goals**: One run per week, run latency budget ~30–90 seconds end-to-end (mostly LLM round-trip). Dashboard list/detail pages render in under 2 seconds against the function backend.

**Constraints**:
- **Cost cap**: hard ceiling of ~80k input tokens + 8k output tokens per run; abort on breach.
- **Privacy**: prompt body and response body MUST NOT enter Application Insights or any operational log sink.
- **Idempotency**: re-run for the same date overwrites narrative and replaces orders (no per-order state to preserve, per Clarification Q1).
- **Token caching**: leverage Anthropic prompt caching on the static-metaprompt block to amortize cost across retries within 5 minutes.
- **No concurrent runs (FR-003)**: Azure Functions v4 timer triggers serialize invocations by default — only one instance of `weeklyAnalysisTimer` executes at a time across the Function App scale-out. This satisfies FR-003 without any code-level locking. If a portal-initiated "Test/Run" coincides with the timer firing, the platform queues the second invocation behind the first. Implementation does not need to add explicit lease/lock logic; tasks.md does not include such a task.

**Scale/Scope**: Single user; ~52 runs per year; ~1 narrative + ~5 orders per run = ~260 order rows per year. Storage cost trivial.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Privacy First (NON-NEGOTIABLE) | ⚠ **TENSION — requires amendment** | Real holdings flow through the Anthropic API for the first time. Spec FR-028 requires that this off-repo data path be documented in the project's governing record. **Resolution**: amend `.specify/memory/constitution.md` with a Principle I carve-out for "authorized third-party AI processing under a published data-retention policy". Captured in Complexity Tracking as a prerequisite task. The amendment is the only way to make this feature compliant; alternatives (running the analysis on-device, redacting holdings before sending) defeat the feature's purpose. |
| II. Clean Architecture / DDD | ✅ Compliant | New entities (`WeeklyAnalysis`, `SuggestedOrder`) in `src/domain/entities/`; new interfaces (`IAnalysisRepository`, `ILLMClient`, `IRiesgoPaisProvider`) in `src/application/interfaces/`; use-case (`GenerateWeeklyAnalysis`) in `src/application/use-cases/analysis/`; implementations (`AzureAnalysisRepository`, `AnthropicLLMClient`, `ArgentinaDatosRiesgoPaisProvider`) in `src/infrastructure/`; thin function handlers in `src/functions/`. Constitution wording calls out `src/database/` for repos but actual practice has migrated to `src/infrastructure/repositories/` (see existing `AzurePositionRepository.js` etc.); the plan follows actual practice. |
| III. Idempotent Data Operations | ✅ Compliant | The "re-runs overwrite analysis, replace orders" rule is by spec design (no owner-managed per-order state, so no surprise overwrite). The new use-case never writes to `portfolioPositions`. |
| IV. Pragmatic Testing | ✅ Compliant | Tests where they pay off: entity validation, use-case orchestration, HTTP response shape, riesgo-país parsing. The LLM call itself is exercised with a mocked SDK in unit tests; one optional gated live test. |
| V. Convention-Driven Workflow | ✅ Compliant | Already on `feature/weekly-rebalance-analysis`. Spec-kit pipeline followed: specify → clarify → plan now. Commit prefixes will be `feat:` / `test:` / `chore:`. |

**Gate result**: PASS, contingent on the constitution amendment landing before or alongside the implementation PR. Without that amendment Principle I is violated. Documented in Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/002-weekly-rebalance-analysis/
├── spec.md                     # /speckit-specify output, refined by /speckit-clarify
├── plan.md                     # This file
├── research.md                 # Phase 0 — open-question resolutions
├── data-model.md               # Phase 1 — entities, snapshot shape, table schemas
├── quickstart.md               # Phase 1 — local dev + manual test recipe
├── contracts/
│   ├── api.md                  # HTTP endpoint contracts (GET list, GET detail)
│   └── submit-analysis-tool.json  # Anthropic tool_use JSON schema
├── checklists/
│   └── requirements.md         # /speckit-specify quality checklist (already exists)
└── tasks.md                    # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── entities/
│       ├── WeeklyAnalysis.js                          (NEW)
│       └── SuggestedOrder.js                          (NEW)
├── application/
│   ├── interfaces/
│   │   ├── IAnalysisRepository.js                     (NEW)
│   │   ├── ILLMClient.js                              (NEW)
│   │   └── IRiesgoPaisProvider.js                     (NEW)
│   ├── use-cases/
│   │   ├── index.js                                   (MODIFY — export GenerateWeeklyAnalysis)
│   │   └── analysis/
│   │       ├── GenerateWeeklyAnalysis.js              (NEW — orchestrator)
│   │       └── prompts/
│   │           └── weekly-rebalance-v1.md             (NEW — versioned metaprompt)
│   └── di/
│       └── container.js                               (MODIFY — register new deps)
├── infrastructure/
│   ├── llm/
│   │   ├── AnthropicLLMClient.js                      (NEW)
│   │   └── LLMLogSanitizer.js                         (NEW — prevents prompt/response in AI sink)
│   ├── providers/
│   │   └── ArgentinaDatosRiesgoPaisProvider.js        (NEW)
│   └── repositories/
│       └── AzureAnalysisRepository.js                 (NEW — implements IAnalysisRepository for both tables)
├── functions/
│   ├── weeklyAnalysisTimer.js                         (NEW — NCRONTAB 0 0 17 * * 5, TZ ET)
│   ├── getWeeklyAnalysisList.js                       (NEW — GET /api/analysis/weekly)
│   └── getWeeklyAnalysis.js                           (NEW — GET /api/analysis/weekly/{date})
└── shared/                                            (existing helpers reused)

dashboard/
└── src/
    └── pages/
        ├── analysis.astro                             (NEW — list page)
        └── analysis-detail.astro                      (NEW — detail page; reads ?date=YYYY-MM-DD from query string. Query-param instead of path-param because the dashboard is statically built — dynamic routes would require getStaticPaths() with a known finite set of dates, which is impossible.)

tests/
├── unit/
│   ├── domain/entities/WeeklyAnalysis.test.js         (NEW)
│   ├── domain/entities/SuggestedOrder.test.js         (NEW)
│   ├── application/use-cases/analysis/
│   │   └── GenerateWeeklyAnalysis.test.js             (NEW)
│   └── infrastructure/llm/LLMLogSanitizer.test.js     (NEW)
└── integration/
    ├── ArgentinaDatosRiesgoPaisProvider.test.js       (NEW — fixture-based)
    └── functions/getWeeklyAnalysis.test.js            (NEW — HTTP smoke)

local.settings.json.example                            (MODIFY — document ANTHROPIC_API_KEY slot)
package.json                                           (MODIFY — add @anthropic-ai/sdk)
.specify/memory/constitution.md                        (MODIFY — Principle I carve-out, version bump)
```

**Structure Decision**: Web-service layout — backend Azure Functions in `src/` (already established) plus Astro frontend in `dashboard/src/pages/` (already established). The new feature slots into both halves without inventing new top-level concepts. The one structural addition is `src/infrastructure/llm/`; it parallels the existing `src/infrastructure/providers/` so the precedent is intact (HTTP-style external clients live under `src/infrastructure/`).

## Complexity Tracking

| Violation / Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Constitution amendment to Principle I (Privacy First) carve-out** | Spec FR-028 says the off-repo data path through Anthropic MUST be documented in the governing record. Without an amendment, this feature literally violates the NON-NEGOTIABLE principle and cannot ship. | Running the analysis on-device with a local model is the only privacy-preserving alternative. Rejected: no local model in the user's setup approaches Claude Opus quality at this task; redaction before sending defeats the purpose (the analysis needs real symbols + quantities + PPCs to reason). |
| **New npm dependency: `@anthropic-ai/sdk`** | Constitution Tech Stack & Constraints requires new runtime dependencies to be justified here. The SDK provides the typed client, `tool_use` plumbing, prompt caching headers, and retry/backoff handling. | Hand-rolling against the REST API directly would re-implement all of the above and reduce maintainability. Rejected. |
| **New dashboard deps: `marked` + `DOMPurify`** | The narrative body comes from the API at runtime, so build-time Astro markdown integrations don't apply; we need lightweight runtime markdown + sanitization. Together <60 KB gzipped — negligible bundle impact. | Server-rendering markdown in the function: increases compute cost per request and complicates testing. Rejected. |
| **New infrastructure subfolder `src/infrastructure/llm/`** | Existing folders (`providers/`, `repositories/`) don't cleanly fit a non-pricing, non-storage external client. A separate folder keeps the LLM client and its sanitizer collocated and discoverable. | Putting `AnthropicLLMClient.js` in `src/infrastructure/providers/` alongside price providers — rejected because the concept is different (no `IPriceProvider` interface, no routing, different lifecycle). |

No other deviations. Per-run cost cap, log sanitizer, idempotent overwrite semantics, read-only dashboard, no operator HTTP trigger — all decisions in the spec align with the existing principles (or are explicitly OOS).

## Phase 0 — Outline & Research

See [research.md](./research.md) for full notes. Topics resolved there:

1. **R1 — Anthropic SDK shape**: `tool_use` with a `submit_analysis` tool to force structured output; prompt caching breakpoint after the static metaprompt + previous-week block; SDK default retry/backoff; usage fields for cost telemetry.
2. **R2 — argentinadatos.com API**: endpoint, response shape, no-auth, timeout strategy, error mapping.
3. **R3 — NCRONTAB Friday 17:00 ET**: `0 0 17 * * 5` with `TZ=America/New_York` (same as `refreshPricesTimer.js`).
4. **R4 — Astro page strategy**: matches existing dashboard pages — static-built page + client-side `fetch` from the function backend at load time; no SSR.
5. **R5 — Markdown rendering in Astro**: `marked` + `DOMPurify` client-side.
6. **R6 — Cost cap enforcement**: pre-call heuristic + post-call measured-cost check; caps stored in `portfolioSettings`.
7. **R7 — Privacy: log sanitizer placement**: the privacy boundary is the `AnthropicLLMClient` adapter; only structured payloads leave it; `LLMLogSanitizer` scrubs error logs.
8. **R8 — Prompt template versioning**: files on disk under `src/application/use-cases/analysis/prompts/`; active version selected via `portfolioSettings`.

## Phase 1 — Design & Contracts

Outputs:

- [data-model.md](./data-model.md) — `WeeklyAnalysis` and `SuggestedOrder` entity schemas, `portfolioSnapshot` JSON shape, two Azure Table schemas with `partitionKey` / `rowKey` design, validation rules, state transitions (mostly N/A — entities are immutable once written).
- [contracts/api.md](./contracts/api.md) — HTTP contracts for `GET /api/analysis/weekly` (list) and `GET /api/analysis/weekly/{date}` (detail). Request/response shapes, status codes, error shape, auth posture (anonymous read — same as existing read endpoints).
- [contracts/submit-analysis-tool.json](./contracts/submit-analysis-tool.json) — Anthropic `submit_analysis` tool JSON schema. The use-case validates the model's tool_use response against this schema before persisting.
- [quickstart.md](./quickstart.md) — Local dev recipe: Azurite + function host + `ANTHROPIC_API_KEY` setup, how to invoke the timer locally, how to view the dashboard.
- **Agent context update**: `CLAUDE.md` SPECKIT block updated to reference this plan as the current active design document.

### Post-design Constitution re-check

After producing Phase 1 artifacts, the gates still hold:

- **Privacy First** — Phase 1 design reinforces it: every prompt/response is funneled through `AnthropicLLMClient` (the single privacy boundary); the log sanitizer is testable in isolation; the data model never stores raw API payloads (just structured outputs + token telemetry).
- **Clean Architecture / DDD** — entities are pure (no I/O), interfaces are owned by `application/`, implementations are pluggable.
- **Idempotent Data Operations** — re-run semantics are a single atomic replace per `date`; no merge edge cases.
- **Pragmatic Testing** — entity validation, use-case orchestration, log sanitizer, riesgo-país parsing all directly testable. Live LLM call gated to integration suite.
- **Convention-Driven Workflow** — file layout matches the existing repo; new code lives in conventional places.

No new violations surfaced; Complexity Tracking is stable.

## Phase 2 — Stop

This command ends after Phase 1 outputs. The next step is `/speckit-tasks` to break this plan into dependency-ordered tasks, followed by `/speckit-analyze` to cross-check spec ↔ plan ↔ tasks before any code is written.
