# Phase 0 — Research

Research notes resolving open questions before Phase 1 design. Each topic has Decision / Rationale / Alternatives.

---

## R1. Anthropic SDK call shape and structured output

**Decision**: Use the official `@anthropic-ai/sdk` Node package. Force structured output via a `tool_use` block with a single tool named `submit_analysis` whose `input_schema` is the JSON schema captured at [`contracts/submit-analysis-tool.json`](./contracts/submit-analysis-tool.json). Configure `tool_choice: { type: "tool", name: "submit_analysis" }` so the model is required to invoke the tool (no free-text-only response). The use-case reads `response.content[*].input` from the tool_use block, validates it against the same JSON schema, and persists it.

**Rationale**:
- Free-text parsing (asking the model to emit JSON in markdown fences) is fragile under retries and model upgrades. Tool-use gives a typed, schema-validated payload directly.
- `tool_choice` enforcement eliminates the "model decides to answer prose instead" edge case.
- The SDK's typed `Anthropic.Messages.MessageCreateParams` makes per-call options (prompt caching, beta headers, retry config) explicit and reviewable.
- Token counts come back on `response.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) — exactly the fields needed for FR-026/FR-027 telemetry.

**Prompt caching**: Insert a `cache_control: { type: "ephemeral" }` breakpoint at the END of the static metaprompt + previous-week block of the system message. Within 5 minutes of the breakpoint write, retries reuse the cached prefix at a steep discount; even the first call gets a meaningful saving once the cached block is large enough. The cache key is derived from the prefix content, so the prompt-template version effectively partitions the cache.

**Retries**: SDK default retry behavior (3 attempts with exponential backoff on transient errors) is acceptable. We do NOT layer additional retries on top — repeated retries during a single timer fire risk exceeding the cost cap. On the SDK exhausting its retries the use-case treats the failure as terminal and writes a `failed` analysis row (FR-019, FR-007 in the failure scenarios).

**Alternatives considered**:
- Hand-rolled `fetch` against `https://api.anthropic.com/v1/messages`: works but re-implements typing, retry, header management. Rejected.
- Free-text JSON in markdown fences: legacy, fragile, requires custom regex extractor. Rejected.
- Structured outputs via OpenAI-style "JSON mode": Anthropic equivalent is `tool_use`, already adopted here.

---

## R2. Argentina riesgo país data source

**Decision**: `GET https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais` — public, no auth required, JSON response. The provider fetches with a 10-second timeout (via `AbortController`), takes the most recent entry from the response array, and returns `{ basisPoints: number, asOf: string (ISO date) }`. On timeout, non-2xx response, or empty array, the provider throws a typed error that the use-case catches and surfaces as a `failed` run (per FR-005).

**Expected response shape** (verified against the live API at the time of research):

```json
[
  { "fecha": "2026-05-15", "valor": 524 },
  { "fecha": "2026-05-14", "valor": 538 }
]
```

The provider always reads the FIRST element (assumed most-recent). Empty array → throw `RiesgoPaisStaleError("no readings in response")`.

**Rationale**:
- No credentials, no scraping, no HTML parsing — clean JSON. Matches the spec's privacy posture (no third-party API keys added beyond Anthropic).
- The `argentinadatos.com` project is community-maintained but stable; the spec's Assumptions explicitly mark the source as substitutable. If it disappears, the provider is rebuilt against an alternative.
- The endpoint has no documented rate limit. One call per week is well within any reasonable bound.

**Alternatives considered**:
- Scrape Infobae or Ámbito: HTML-parsing brittleness, source-of-truth confusion. Rejected.
- Bloomberg / Reuters paid feed: overkill, paid, and requires credential management. Rejected.
- Run our own riesgo-país calculator from bond yields: complex, not the point of this feature. Rejected.

---

## R3. NCRONTAB pattern for Friday 17:00 ET

**Decision**: NCRONTAB expression `0 0 17 * * 5` with the Function App's `TZ` setting set to `America/New_York` (it already is, established by the daily price refresh in feature 001). This means: at minute 0, second 0, 17:00 on weekday 5 (Friday), every month, every year, interpreted in the configured time zone.

`refreshPricesTimer.js` already uses the same TZ wiring at 16:30 ET. The new timer slots in at 17:00 ET so the daily price refresh (16:30) completes before the analysis runs. This guarantees the LLM gets the day's closing prices, not stale ones from earlier in the day.

**Rationale**:
- 17:00 ET = 1 hour after the NYSE regular-hours close (16:00 ET). Generous buffer for the upstream price refresh.
- DST handling is automatic via `TZ` (Azure Functions on Linux honors it).
- Same wiring pattern as the existing timer means no new ops surface to learn.

**Alternatives considered**:
- 16:35 ET (5 minutes after price refresh): too tight; if the price refresh runs late, the analysis sees stale prices.
- A separate Logic App for scheduling: more moving parts, no upside.

---

## R4. Astro page strategy

**Decision**: Match the existing dashboard pattern — statically built Astro pages that `fetch()` from the function backend at load time on the client side. No server-side rendering, no Astro Endpoints. Two new pages:

- `dashboard/src/pages/analysis.astro` → fetches `GET /api/analysis/weekly`, renders a list of rows (date, status, summary).
- `dashboard/src/pages/analysis/[date].astro` → reads `date` from the URL, fetches `GET /api/analysis/weekly/{date}`, renders the narrative body (markdown) and a read-only orders table.

The backend URL is provided to the dashboard via the same env-var/config mechanism `positions.astro` already uses.

**Rationale**:
- Consistency with existing pages (`brokers.astro`, `positions.astro`, `settings.astro`). Less surface area to maintain.
- Astro Static Web Apps deployment is already wired; SSR would require a different deployment topology.
- Markdown rendering is a client-side concern anyway (see R5).

**Alternatives considered**:
- SSR via Astro adapter: deployment-pipeline change, no functional gain here.
- Direct table-storage read from Astro at build time: would force re-deploy on every weekly run. Absurd.

---

## R5. Markdown rendering in Astro

**Decision**: Use `marked` (lightweight markdown parser, ~30 KB) for client-side rendering of the narrative body. The library is well-maintained, has no transitive deps, and is already battle-tested for this kind of in-page rendering. The narrative is sanitized lightly with `DOMPurify` (~20 KB) as defense-in-depth even though we control the prompt.

Both libraries are added to the `dashboard/` package, not the root `package.json`. Justified by Constitution Tech Stack & Constraints — the dashboard is its own workspace and this is rendering UI, not analysis logic.

**Rationale**:
- The narrative comes from an LLM we prompted — low risk of malicious markup but non-zero (prompt injection in upstream data could in theory affect output). DOMPurify covers that risk cheaply.
- `marked` + `DOMPurify` together are <60 KB gzipped — negligible bundle impact for an internal dashboard.
- Astro's `@astrojs/markdown-remark` is a build-time package; we need runtime parsing since the markdown comes from an API response, not from a `.md` file in the repo.

**Alternatives considered**:
- `markdown-it`: equally good, slightly larger. Either works.
- Render the narrative server-side in the function and ship HTML: increases function compute, complicates testing, no real upside.

---

## R6. Cost cap enforcement

**Decision**: Compute the prompt's input token count *before* the API call using a heuristic (4 chars ≈ 1 token, with a 20% safety margin) — abort with a `failed` row if the heuristic predicts >80K input tokens. After the API call, read `response.usage.output_tokens` and the exact `input_tokens`; if the actual measured cost exceeds the configured cap (token-based or USD-based), still persist the analysis row (the cost is already incurred) but log a `cost_cap_exceeded_after_call` warning so the operator can revise the cap or tighten the prompt.

The cap values live in `portfolioSettings` (existing table) under keys like `analysis.maxInputTokens` and `analysis.maxOutputTokens`. Default values: 80K input, 8K output.

**Rationale**:
- Pre-call heuristic protects against runaway costs from prompt growth (e.g., a portfolio that explodes into thousands of positions).
- Post-call check is informational — the spend is sunk by then — but useful for tuning.
- Storing caps in settings (not env or code) matches FR-031 (configurable model) and keeps tuning a non-code change.

**Alternatives considered**:
- Anthropic's official tokenizer for exact pre-call counts: extra dependency, marginal gain over heuristic+safety-margin for this purpose.
- Hard-cap via the API's `max_tokens` request param only: doesn't cover input-side runaway.

---

## R7. Privacy: log sanitizer placement

**Decision**: Wrap the Anthropic client in a small `AnthropicLLMClient` adapter (implements `ILLMClient`). The adapter is the only thing that ever sees the prompt and the raw response. It returns to the use-case ONLY the structured `{ summary, markdownBody, orders[], usage: { inputTokens, outputTokens, costUsd } }` payload — never the raw `messages` array or the unparsed response object. A separate `LLMLogSanitizer` class handles error logging: when an exception bubbles up from the SDK, the sanitizer extracts only safe fields (status code, error type, request ID) and discards any echoed prompt content.

The use-case writes ONLY metadata to its own logs (via the existing `src/shared/logger.js`). Application Insights is configured at the function level to not auto-capture `process.stdout` JSON beyond what the function explicitly logs.

**Rationale**:
- Forces the privacy boundary into one auditable file (`AnthropicLLMClient.js`) instead of relying on every caller to remember to scrub.
- Aligns with constitutional Principle II (Clean Architecture): the privacy invariant lives at the infrastructure boundary.
- Sanitizer is independently testable (see `tests/unit/infrastructure/llm/LLMLogSanitizer.test.js` in the plan).

**Alternatives considered**:
- Application Insights custom telemetry processor that redacts `prompt`/`response` fields globally: too magical, fragile against schema drift in future SDK versions.
- Trust-the-caller pattern (no adapter): violates Principle II and one missed `console.log` leaks PII.

---

## R8. Prompt template versioning

**Decision**: Each prompt template version is a separate file under `src/application/use-cases/analysis/prompts/`, named `weekly-rebalance-v{N}.md` where N is a monotonically increasing integer (starting at 1). The use-case reads the file matching the configured active version (from `portfolioSettings` under key `analysis.promptVersion`, default `weekly-rebalance-v1`). The version string is stamped on the persisted analysis row.

To "release" a new prompt version, the owner adds `weekly-rebalance-v2.md` and updates the settings record. The old file is kept in source control indefinitely for post-hoc auditing of old runs.

**Rationale**:
- Versioning as content-on-disk is simple, auditable, and Git-tracked.
- Default-via-settings means no code change to roll out a new prompt version.
- Old files retained means an old analysis row's `promptVersion` field always resolves to readable content.

**Alternatives considered**:
- Database-stored prompt versions: more surface area, no clear upside for a single-developer project.
- Single prompt file with conditional sections: less auditable; harder to A/B compare post-hoc.

---

## Open items deferred to implementation

None. All material questions are resolved here or in the spec's Clarifications log. The next step is Phase 1 — data model and contracts.
