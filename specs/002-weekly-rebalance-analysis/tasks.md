# Tasks: Weekly LLM Portfolio Rebalance Analysis

**Input**: Design documents from `/specs/002-weekly-rebalance-analysis/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api.md`, `contracts/submit-analysis-tool.json`, `quickstart.md`

**Tests**: Constitution Principle IV (Pragmatic Testing) requires tests for domain entities, use-cases, and HTTP smoke tests. Test tasks are included for those targets only. No TDD ordering imposed — write tests alongside or just after the artifact.

**Organization**: Tasks are grouped by user story so each story can be implemented and deployed independently. US1 alone is a usable MVP.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]** = parallelizable (different files, no dependency on incomplete tasks above it in the same phase)
- **[Story]** = US1 / US2 / US3 mapping (Setup, Foundational, Polish tasks have no story label)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prerequisites that must land before any code is written.

- [ ] T001 Amend `.specify/memory/constitution.md` — add Principle I (Privacy First) carve-out clause acknowledging the Anthropic API as an authorized off-repo data path under its published data-retention policy. Bump version to 1.1.0 with Sync Impact Report. Required by FR-028 and the Constitution Check tension in `plan.md` Complexity Tracking.
- [ ] T002 [P] Add `@anthropic-ai/sdk` runtime dependency to root `package.json`. Pin to a known-good minor version (latest stable at install time). Run `npm install`. Commit the lockfile change.
- [ ] T003 [P] Add `marked` and `dompurify` runtime dependencies to `dashboard/package.json`. Run `npm install` inside `dashboard/`. Commit the lockfile.
- [ ] T004 [P] Update `local.settings.json.example` to document the `ANTHROPIC_API_KEY` slot under `Values`. Add a comment noting that real keys MUST live in `local.settings.json` (gitignored) for dev and in Function App Application Settings for prod.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Architectural skeleton — interfaces, entities, repository, external clients, DI wiring, and the prompt template. Required by all user stories.

**⚠️ CRITICAL**: No user-story work begins until this phase completes.

### Interfaces

- [ ] T005 [P] Create interface `IAnalysisRepository` at `src/application/interfaces/IAnalysisRepository.js`. Declare methods: `getLatest(limit)`, `getByDate(date)`, `upsert(weeklyAnalysis, suggestedOrders)`. Methods are unimplemented; this is an abstract contract.
- [ ] T006 [P] Create interface `ILLMClient` at `src/application/interfaces/ILLMClient.js`. Declare method: `submitAnalysis({ systemPrompt, userMessage, toolSchema, model, maxInputTokens, maxOutputTokens })` returning `{ summary, markdownBody, orders[], usage: { inputTokens, outputTokens, costUsd } }`.
- [ ] T007 [P] Create interface `IRiesgoPaisProvider` at `src/application/interfaces/IRiesgoPaisProvider.js`. Declare method: `getLatest()` returning `{ basisPoints, asOf }`.
- [ ] T008 Update `src/application/interfaces/index.js` to export the three new interfaces.

### Domain entities

- [ ] T009 [P] Create `WeeklyAnalysis` entity at `src/domain/entities/WeeklyAnalysis.js`. Fields and validation per `data-model.md` (date, status, summary, markdownBody, riesgoPaisBp, riesgoPaisAsOf, portfolioSnapshot, tokensIn, tokensOut, costUsd, durationMs, errorMessage, generatedAt, modelUsed, promptVersion). Constructor validates: `status ∈ {completed, failed}`, `errorMessage` set iff `failed`, numeric fields ≥ 0, `markdownBody.length ≥ 200` when `completed`. Static `id(date)` returns `{ partitionKey: "weekly", rowKey: date }`.
- [ ] T010 [P] Create `SuggestedOrder` entity at `src/domain/entities/SuggestedOrder.js`. Fields per `data-model.md` (analysisDate, index, broker, symbol, side, quantity, rationale, conviction). Constructor validates: `side ∈ {buy, sell}` (rejects `hold` explicitly), `broker ∈ {galicia, iol, ibkr, bullmarket, cash}`, `quantity > 0`, `rationale.length ≥ 20`, `conviction ∈ {low, medium, high}`. Static `id(analysisDate, index)` returns `{ partitionKey: analysisDate, rowKey: String(index).padStart(2, "0") }`.
- [ ] T011 Update `src/domain/entities/index.js` to export `WeeklyAnalysis` and `SuggestedOrder`.
- [ ] T012 [P] Unit tests for `WeeklyAnalysis` validation at `tests/unit/domain/entities/WeeklyAnalysis.test.js`. Cover: happy path completed, happy path failed, missing errorMessage on failed (throws), short markdownBody (throws), negative tokensIn (throws), invalid status enum (throws), id() shape.
- [ ] T013 [P] Unit tests for `SuggestedOrder` validation at `tests/unit/domain/entities/SuggestedOrder.test.js`. Cover: happy path buy, happy path sell, rejecting `side: "hold"` (throws), unknown broker (throws), zero/negative quantity (throws), short rationale (throws), id() shape with zero-padding.

### Repository

- [ ] T014 Implement `AzureAnalysisRepository` at `src/infrastructure/repositories/AzureAnalysisRepository.js`. Implements `IAnalysisRepository`. Methods:
  - `getLatest(limit=20)` → query `portfolioAnalysis` PK=`weekly`, sort rowKey desc, take `limit`. Hydrates each row to `WeeklyAnalysis` (deserializing the JSON-string `portfolioSnapshot` field).
  - `getByDate(date)` → fetch one `portfolioAnalysis` row + batch query `portfolioOrders` PK=date. Returns `{ analysis: WeeklyAnalysis, orders: SuggestedOrder[] }` or `null`.
  - `upsert(weeklyAnalysis, suggestedOrders)` → transactional batch: delete prior `portfolioOrders` rows for that date (if any), then upsert the `portfolioAnalysis` row, then batch-write the new `portfolioOrders` rows.
  - On first call, ensure both tables exist (`createTable` swallowing the "already exists" error — pattern matches existing repositories).
- [ ] T015 Register `analysisRepository` factory in `src/application/di/container.js`. Follow the singleton pattern used by `getPositionRepository()` etc.

### LLM infrastructure

- [ ] T016 [P] Implement `LLMLogSanitizer` at `src/infrastructure/llm/LLMLogSanitizer.js`. Exposes one method `sanitizeError(err)` that extracts only `{ status, errorType, requestId, message }` from an Anthropic SDK error, explicitly DROPPING any echoed prompt/response content. Returns a plain object safe to log.
- [ ] T017 [P] Unit test for `LLMLogSanitizer` at `tests/unit/infrastructure/llm/LLMLogSanitizer.test.js`. Cover: a synthetic error object containing a `request.messages[0].content` payload (must be scrubbed); a vanilla `Error` instance; an SDK-style error with `status`, `error.type`, `request_id`.
- [ ] T018 Implement `AnthropicLLMClient` at `src/infrastructure/llm/AnthropicLLMClient.js`. Implements `ILLMClient`. Construct the official `Anthropic` client with `apiKey: process.env.ANTHROPIC_API_KEY`. In `submitAnalysis`:
  - Set `tools: [{ name: "submit_analysis", input_schema: <loaded from contracts/submit-analysis-tool.json> }]`.
  - Set `tool_choice: { type: "tool", name: "submit_analysis" }`.
  - Add `cache_control: { type: "ephemeral" }` to the static prefix of the system message (per research R1).
  - Estimate input tokens with the pre-call heuristic (chars/4 × 1.2). If estimate > `maxInputTokens`, throw `CostCapExceededError` BEFORE calling the API.
  - On SDK exception, wrap with `LLMLogSanitizer.sanitizeError` before re-throwing.
  - Extract `tool_use.input` from the response, validate against the same JSON schema (defense-in-depth), compute `costUsd` from `usage` and per-model rates (rates as a constant map keyed by model id).
  - Return `{ summary, markdownBody, orders, usage: { inputTokens, outputTokens, costUsd } }`. NEVER return the raw response.
- [ ] T019 Register `llmClient` factory in `src/application/di/container.js`. Singleton.

### Riesgo-país provider

- [ ] T020 [P] Implement `ArgentinaDatosRiesgoPaisProvider` at `src/infrastructure/providers/ArgentinaDatosRiesgoPaisProvider.js`. Implements `IRiesgoPaisProvider`. Use `fetch` + `AbortController` with a 10-second timeout (match the existing price-provider pattern). Endpoint: `https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais`. Read first array element. Return `{ basisPoints: number, asOf: string }`. On timeout, non-2xx, or empty array, throw a typed `RiesgoPaisFetchError(reason)`.
- [ ] T021 [P] Integration test for the provider at `tests/integration/ArgentinaDatosRiesgoPaisProvider.test.js`. Use a recorded JSON fixture in `tests/fixtures/argentinadatos-riesgo-pais.json`. Inject a fake fetcher returning the fixture; assert returned `{ basisPoints, asOf }`. Add a second test that asserts `RiesgoPaisFetchError` is thrown on empty array.
- [ ] T022 Register `riesgoPaisProvider` factory in `src/application/di/container.js`. Singleton.

### Prompt template + settings

- [ ] T023 Author the versioned prompt template at `src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md`. Sections per spec FR-010 and `metaprompt-rebalance-plan.md` §9 domain context:
  - **Role** — Portfolio strategist for an Argentina-USD mixed portfolio.
  - **Inputs** — Slots: `{{portfolioSummary}}`, `{{previousAnalysis}}` (markdown + orders + previous portfolio snapshot, or `"none — first run"`), `{{riesgoPais}}` (basisPoints + asOf, or `"unavailable"`), `{{generatedAt}}`.
  - **Strategic framework** (inline as content per Clarification Q3): bucket structure (US/ARG/OffSystem), riesgo-país 600 bp trigger, deploy-priority rankings with caps, standing position-level directives (BRK.B ADD, MU TRIM, DELL TRIM, APG TRIM, FISV HOLD, GOOGL@BullMarket CLOSE), target allocation framework.
  - **Conventions** — bonds per 100 nominales, MEP valuation for ARS, Galicia preference for sovereigns, GD30/AL30 MEP-liquid no-close, commission + IVA on ARS trades, broker minimums.
  - **Required output** — must call `submit_analysis` tool; narrative sections (Executive Summary, Market Context, Portfolio Assessment, Week-over-week Comparison, Suggested Actions).
  - **Guardrails** — no >25% rotation unless conviction high, no selling cash, flag illiquid bonds, rationale must cite drift/directive/trigger/context, week-over-week section MUST compare current portfolio to prior snapshot when prior exists.
- [ ] T024 Add a one-off bootstrap script at `scripts/seed-analysis-settings.js` that writes the four analysis settings directly to the `portfolioSettings` Azure Table via `@azure/data-tables` (mirroring the pattern of `scripts/seed-brokers.js`). Idempotent insert-only: existing keys are left untouched. Defaults: `analysis.model` = `claude-opus-4-7`, `analysis.promptVersion` = `weekly-rebalance-v1`, `analysis.maxInputTokens` = `80000`, `analysis.maxOutputTokens` = `8000`. The script reads `AZURE_STORAGE_CONNECTION_STRING` from env (same convention as the other seed scripts). Add a one-line "run this once" note to `quickstart.md`. Direct-table write avoids the `authLevel: 'function'` key handshake required by `PUT /api/settings/{key}`.

**Checkpoint**: Foundation ready — all three user stories can now proceed.

---

## Phase 3: User Story 1 — Weekly analysis appears on Friday (Priority: P1) 🎯 MVP

**Goal**: Every Friday, a fresh strategic analysis with structured buy/sell suggestions appears on the dashboard without owner action. The narrative covers current state, market context, and suggested actions. Failure paths bubble as 500s for now (US3 surfaces them on the dashboard).

**Independent Test**: After a Friday close (or after invoking the timer locally via `func admin functions`), open `/analysis` on the dashboard. The latest entry exists; clicking in shows narrative + orders table. Each order has broker, symbol, side, quantity, rationale, conviction. Matches spec US1 acceptance scenarios 1–4.

### Implementation for User Story 1

- [ ] T025 [US1] Implement `GenerateWeeklyAnalysis` use-case (happy path) at `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`. Constructor takes `{ analysisRepository, llmClient, riesgoPaisProvider, getPortfolioSummary, settingsRepository, promptLoader, clock }`. `execute(targetDate)` flow:
  1. Read `analysis.model`, `analysis.promptVersion`, `analysis.maxInputTokens`, `analysis.maxOutputTokens` from settings.
  2. Load the active prompt template file from `src/application/use-cases/analysis/prompts/{promptVersion}.md`.
  3. Call `getPortfolioSummary.execute()` for the current portfolio + MEP + prices.
  4. Call `riesgoPaisProvider.getLatest()`.
  5. (US1 only: skip prior-week loading; pass `previousAnalysis: null` to the prompt.)
  6. Render the prompt with the slots filled.
  7. Call `llmClient.submitAnalysis(...)`.
  8. Build a `WeeklyAnalysis` (status `completed`, populated `portfolioSnapshot` from the portfolio summary) and N `SuggestedOrder` entities from the result.
  9. Persist via `analysisRepository.upsert(...)`.
  10. Log run metadata (date, model, tokens, cost, orderCount, duration) — NEVER the prompt/response body.
  11. Return the persisted `WeeklyAnalysis`.
- [ ] T026 [US1] Register `getGenerateWeeklyAnalysis` factory in `src/application/di/container.js` and export from `src/application/use-cases/index.js`.
- [ ] T027 [P] [US1] Implement timer function at `src/functions/weeklyAnalysisTimer.js`. NCRONTAB `0 0 17 * * 5` (Friday 17:00 ET via the existing `TZ=America/New_York` app setting). Function body: resolve `targetDate` from now (in the ET timezone), invoke `container.getGenerateWeeklyAnalysis().execute(targetDate)`. Thin — no business logic in the handler (Constitution II).
- [ ] T028 [P] [US1] Implement read endpoint `GET /api/analysis/weekly` at `src/functions/getWeeklyAnalysisList.js`. Parses `?limit=` (default 20, max 200), calls `analysisRepository.getLatest(limit)`, returns the list shape from `contracts/api.md`. `authLevel: 'anonymous'`.
- [ ] T029 [P] [US1] Implement read endpoint `GET /api/analysis/weekly/{date}` at `src/functions/getWeeklyAnalysis.js`. Validates the `date` path param matches `YYYY-MM-DD` (400 if not). Calls `analysisRepository.getByDate(date)`. Returns the detail shape from `contracts/api.md`. 404 if no row. `authLevel: 'anonymous'`.
- [ ] T030 [US1] Register the three new functions in `src/functions/index.js` if that file aggregates registrations (mirror the existing pattern; otherwise the v4 functions self-register via `app.timer(...)` / `app.http(...)`).
- [ ] T031 [P] [US1] Implement dashboard list page at `dashboard/src/pages/analysis.astro`. Mirror layout style of `dashboard/src/pages/positions.astro`. On load (client-side `fetch`), call `GET /api/analysis/weekly?limit=20`. Render a table: date (link to detail), status badge, one-line summary, orderCount, modelUsed, costUsd. Read-only.
- [ ] T032 [P] [US1] Implement dashboard detail page at `dashboard/src/pages/analysis/[date].astro`. Reads `date` from Astro's URL params. On load, calls `GET /api/analysis/weekly/{date}`. Renders: header (date, status, riesgo país reading + asOf), narrative body via `marked` → `DOMPurify` → set innerHTML, orders table (read-only columns: broker, symbol, side, quantity, conviction, rationale). 404 path shows a friendly "no analysis for this date" message.

### Tests for User Story 1

- [ ] T033 [P] [US1] Unit test for `GenerateWeeklyAnalysis` (happy path) at `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js`. Inject mocks for all collaborators. Cover:
  - First-ever run (no prior analysis): prompt is rendered with `previousAnalysis: null`, completed row is persisted, snapshot is populated from portfolio summary.
  - Riesgo país fetch returns a value: it is included in the prompt and persisted on the analysis row.
  - Settings drive the model name and prompt version (vary them in two test cases).
  - Assert that `analysisRepository.upsert` was called once with the right shape; assert the entity passed had `status: "completed"`.
  - Assert that NO log call contains the prompt body or the raw response.
- [ ] T034 [P] [US1] HTTP smoke test for `GET /api/analysis/weekly/{date}` at `tests/integration/functions/getWeeklyAnalysis.test.js`. Seed Azurite with one fake `portfolioAnalysis` row + 2 fake `portfolioOrders` rows. Hit the endpoint; assert 200 + shape matches the contract. Add: invalid date → 400; missing date → 404.

**Checkpoint**: US1 fully functional. The MVP slice ships here. Validate end-to-end via `quickstart.md` before moving on.

---

## Phase 4: User Story 2 — Week-over-week continuity (Priority: P2)

**Goal**: Next week's analysis sees last week's narrative + suggested orders + portfolio snapshot, so the LLM can reason about deltas in the current portfolio and adjust its thesis.

**Independent Test**: Run two consecutive analyses (use Azure portal Test/Run or local `func admin functions` twice). Between runs, manually update one position in `portfolioPositions`. The second analysis's `markdownBody` must explicitly identify the per-position change in its week-over-week section and reason about whether it looks like the prior suggestion was acted on. Matches spec US2 acceptance scenarios 1–3.

### Implementation for User Story 2

- [ ] T035 [US2] Extend `GenerateWeeklyAnalysis.execute()` to load the previous analysis: before rendering the prompt, call `analysisRepository.getLatest(1)`, find the most recent row strictly older than `targetDate`. If found, pass it (narrative + orders + portfolioSnapshot) to the prompt rendering as `previousAnalysis`. If none (first run), pass `null` and the prompt template's first-run branch applies. File: `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`.
- [ ] T036 [US2] Refine the prompt template at `src/application/use-cases/analysis/prompts/weekly-rebalance-v1.md`:
  - Strengthen the "Required output" section to require the Week-over-week Comparison section to enumerate per-position deltas between `{{previousAnalysis.portfolioSnapshot}}` and `{{portfolioSummary}}` when both are present.
  - Add explicit instruction: "For each prior suggested order in `{{previousAnalysis.orders}}`, comment on whether the current portfolio is consistent with that suggestion having been executed (compare prior snapshot's per-position quantity to current). Do not silently repeat a prior suggestion with the same rationale if the portfolio shows no movement on it."

### Tests for User Story 2

- [ ] T037 [P] [US2] Unit test for `GenerateWeeklyAnalysis` with prior-week input, at `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js` (extend the existing test file). Cover:
  - Mock `analysisRepository.getLatest(1)` to return a prior completed analysis with a snapshot. Assert the rendered prompt passed to `llmClient.submitAnalysis` includes the prior narrative, prior orders, and prior snapshot.
  - Boundary: prior analysis exists but has `status: "failed"` → still passed to the prompt (the LLM can read what was attempted and what went wrong).
  - First-ever run: `getLatest(1)` returns `[]`; prompt receives `previousAnalysis: null`.

**Checkpoint**: US2 fully functional. Week-over-week section now meaningfully populated.

---

## Phase 5: User Story 3 — Failed runs surfaced on the dashboard (Priority: P3)

**Goal**: Runs that fail (LLM error, riesgo-país unreachable, tool-use schema mismatch, cost-cap exceeded) leave a visible "failed" entry on the dashboard with a short reason. The owner notices the gap rather than discovering silent silence weeks later.

**Independent Test**: Force a failure path (set a bad ANTHROPIC_API_KEY temporarily; or point the riesgo-país provider at a 404 URL) and re-run the timer. The dashboard list page now shows a row dated for that run with status "failed" and a short error string. No suggested orders appear under it. Matches spec US3 acceptance scenarios 1–3.

### Implementation for User Story 3

- [ ] T038 [US3] Add failure-handling branches to `GenerateWeeklyAnalysis.execute()` at `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js`. Wrap the whole `try`:
  - `RiesgoPaisFetchError` → persist `WeeklyAnalysis(status: "failed", errorMessage: "riesgo-pais source unreachable: <reason>", portfolioSnapshot: <if available>)`.
  - `CostCapExceededError` (pre-call) → persist `WeeklyAnalysis(status: "failed", errorMessage: "cost cap exceeded: <details>", portfolioSnapshot: <if available>)`.
  - SDK error (post-sanitization) → persist `WeeklyAnalysis(status: "failed", errorMessage: "<sanitized message>", portfolioSnapshot: <if available>)`.
  - Tool-use schema validation failure → persist `WeeklyAnalysis(status: "failed", errorMessage: "tool_use schema validation failed: <details>")`.
  - Any other unexpected throw → persist `failed` with `errorMessage: "unexpected error: <type>"`, re-throw at the end so the function handler logs the stack (without payload).
- [ ] T039 [P] [US3] Confirm the list endpoint at `src/functions/getWeeklyAnalysisList.js` already returns failed rows alongside completed (it should — the response shape in `contracts/api.md` covers both). If the implementation accidentally filters by status, drop the filter. File: `src/functions/getWeeklyAnalysisList.js`.
- [ ] T040 [P] [US3] Confirm the detail endpoint at `src/functions/getWeeklyAnalysis.js` returns the failed-row shape (no `summary`/`markdownBody`/`orders` blocks; `errorMessage` present). Adjust serializer if needed. File: `src/functions/getWeeklyAnalysis.js`.
- [ ] T041 [US3] Update the list page at `dashboard/src/pages/analysis.astro` to render failed entries distinguishably (e.g., red status badge, error reason inline). Make the row still clickable into a detail view that renders the failure.
- [ ] T042 [US3] Update the detail page at `dashboard/src/pages/analysis/[date].astro` to render the failed state: header shows status "failed" + error reason, no narrative block, no orders table (or empty-state message).

### Tests for User Story 3

- [ ] T043 [P] [US3] Unit test for `GenerateWeeklyAnalysis` failure branches, at `tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.test.js` (extend). Cover each failure type — riesgo país, cost cap, SDK error, tool-use schema mismatch, generic throw. Assert in each case: a failed `WeeklyAnalysis` row is persisted with the right `errorMessage`, no orders are persisted, and the use-case logs only metadata (no payload).

**Checkpoint**: All three stories functional. Dashboard correctly reports both completed and failed runs.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Loose ends and end-to-end validation.

- [ ] T044 [P] Add a `costUsd` rollup query to `AzureAnalysisRepository.getLatest()` (or a new method) so the dashboard list page can display the trailing-12-week running average cost per run (supports SC-005 spot-check). File: `src/infrastructure/repositories/AzureAnalysisRepository.js`.
- [ ] T045 [P] Add the `analysis` page link to the dashboard's primary navigation (whichever file owns the nav — likely `dashboard/src/layouts/Layout.astro` or `dashboard/src/components/Nav.astro`; inspect to confirm).
- [ ] T046 Run `quickstart.md` end-to-end against a fresh local Azurite + a local function host, including: success run → re-run overwrite → failure run (disconnect network) → dashboard renders all three correctly → log inspection confirms no prompt/response leak.
- [ ] T047 [P] Add a brief section to the repo's main `README.md` describing the weekly analysis feature: what it does, where to find the dashboard pages, what env vars are needed, where the prompt template lives. Keep it short — most of the detail lives in `quickstart.md`.
- [ ] T048 Self-review the diff against Constitution Principle I (Privacy First): grep the changed files for any literal real-holdings symbols, PPC values, or quantity values that may have leaked into test fixtures, comments, or code. Replace any finds with obvious placeholders.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: No dependencies. T001 is a constitution amendment; it has no code dependency but is a prerequisite to merging this feature per the Constitution Check.
- **Phase 2 (Foundational)**: Depends on Setup. Blocks all user stories.
- **Phase 3 (US1)**: Depends on Foundational. MVP slice ships here.
- **Phase 4 (US2)**: Depends on US1 (extends the same use-case).
- **Phase 5 (US3)**: Depends on US1 (extends the same use-case and endpoints). Independent of US2 — can be done in parallel with US2 by a second developer if desired, though both touch `GenerateWeeklyAnalysis.js`.
- **Phase 6 (Polish)**: Depends on the stories that are being shipped (T046 quickstart validation should cover whichever stories are in scope for the PR).

### Within Phase 2 (parallel opportunities)

After T005–T008 (interfaces) land, the following can run in parallel:

- T009 + T010 (entities, different files)
- T012 + T013 (entity tests, different files)
- T016 + T017 (sanitizer + its test)
- T020 + T021 (riesgo-país provider + its test)

T014 (repository), T018 (LLM client), T023 (prompt template), T024 (settings seed) are also independent files and can run alongside the above, BUT T015/T019/T022 (DI registrations) all touch the same `container.js` and MUST be serial.

### Within Phase 3 (US1, parallel opportunities)

After T025 (use-case happy path) and T026 (DI registration) land:

- T027 (timer), T028 (list endpoint), T029 (detail endpoint), T031 (list page), T032 (detail page) are all in different files. T031 and T032 can be developed in parallel with the backend endpoints if the front-end developer stubs the API responses temporarily.
- T033 (use-case unit test) can be written before or after T025; both live in the same file.
- T034 (HTTP smoke test) is independent.

### Within Phase 4 (US2)

- T035 (use-case extension) and T036 (prompt template refinement) are in different files, can be done in parallel.
- T037 (test extension) extends an existing file from T033, must come after T035.

### Within Phase 5 (US3)

- T038 (use-case failure branches) and T041/T042 (dashboard rendering) are independent files; can run in parallel.
- T039/T040 are confirmation steps and may be no-ops if the implementation in US1 already covered both shapes.
- T043 extends the same test file as T033/T037; must come after T038.

---

## Parallel example — Foundational phase

```bash
# After T005-T008 land, in one developer's shell:
# - tab 1: implement WeeklyAnalysis + its test
# - tab 2: implement SuggestedOrder + its test
# - tab 3: implement LLMLogSanitizer + its test
# - tab 4: implement ArgentinaDatosRiesgoPaisProvider + its test

# Tasks:
T009 [P] WeeklyAnalysis entity
T010 [P] SuggestedOrder entity
T012 [P] WeeklyAnalysis tests
T013 [P] SuggestedOrder tests
T016 [P] LLMLogSanitizer
T017 [P] LLMLogSanitizer tests
T020 [P] ArgentinaDatosRiesgoPaisProvider
T021 [P] ArgentinaDatosRiesgoPaisProvider integration test
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup (T001-T004)
2. Phase 2: Foundational (T005-T024)
3. Phase 3: User Story 1 (T025-T034)
4. **STOP and VALIDATE**: run `quickstart.md` end-to-end. If the Friday analysis renders correctly on the dashboard with sensible orders, that's a shippable MVP.

This is genuinely useful even without US2 and US3: the analysis runs every Friday, the dashboard shows it, you read it. Failures show up as 500s in the Function App logs, which is enough for a single-user system to iterate from.

### Incremental Delivery

1. Ship MVP (US1) — owner gets the weekly report.
2. Add US2 — the report becomes coherent across weeks.
3. Add US3 — failures stop being invisible.

Each story is a small, independently testable PR.

### Solo developer (single-track)

Linear by phase. ~3–5 days of focused work for the MVP slice; US2 and US3 are smaller increments (~half-day each).

---

## Task count summary

| Phase | Tasks | Notes |
|---|---|---|
| Setup | 4 | T001-T004 |
| Foundational | 20 | T005-T024 |
| US1 (MVP) | 10 | T025-T034 |
| US2 | 3 | T035-T037 |
| US3 | 6 | T038-T043 |
| Polish | 5 | T044-T048 |
| **Total** | **48** | |

Parallel opportunities marked with [P] in each phase. The largest parallel surface is Foundational (~8 tasks runnable concurrently after interfaces land) and the US1 endpoints/pages (~5 tasks runnable concurrently after the use-case lands).

---

## Notes

- Tests are alongside or just after implementation (not TDD-enforced). Run `npm test` after each task or task group; never commit a red test on `main`.
- Commit prefix conventions: `feat:` for new entities/use-cases/functions/pages, `test:` for test-only commits, `chore:` for dependency bumps, `docs:` for `quickstart.md` updates, `refactor:` if a later task tidies an earlier one.
- Privacy: T048 is the final guardrail before opening the PR. Every task that adds a test fixture should use placeholder symbols (`FOO`, `BAR`) and values (`123.45`), not anything resembling real holdings.
- The constitution amendment (T001) is independently mergeable to `main` ahead of the feature PR if you prefer to land it cleanly first. It is a prerequisite, not a co-dependent.
