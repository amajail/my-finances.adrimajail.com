# System Assessment — 2026-10-28

Status: exploratory assessment, no real holdings data (quantities, PPC, account
identifiers, or symbols) — per docs/research/README.md convention.
Model used for this assessment run: claude-sonnet-5-5

## 1. Model Version

Current-lineup facts come from the `claude-api` skill, cached 2026-10-06.

| Source | Value | Status |
| --- | --- | --- |
| Live `modelUsed` (newest completed run, 2026-10-24) | `claude-opus-4-8` | Two generations behind (`claude-opus-5-5` is current). |
| Coded default (`DEFAULTS.model`, `GenerateWeeklyAnalysis.js`) | `claude-opus-4-7` | Differs from live: the `analysis.model` Setting is overriding it. |
| `MODEL_RATES` keys (`AnthropicLLMClient.js`) | opus-4-8 / 4-7 / 4-6, sonnet-5, sonnet-4-6, haiku-4-5 (+ dated alias) | Missing `claude-opus-5`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5`, `claude-fable-5-1`. |
| `MODEL_RATES` values | `claude-sonnet-5` listed at 3/15 per MTok | Stale: the lineup lists 2/10. Opus 5.5 is 4/20 and would fall back to `DEFAULT_RATES` at 5/25. |
| IMF classifier | Code default `claude-haiku-4-5-20251001` | The Function App setting `analysis.imfModel` was not read this run. |

A missing id only skews `costUsd` (falls back to `DEFAULT_RATES`). The cost cap
is token-based and unaffected.

**API-compatibility check (target: Opus 5.5 / Sonnet 5.5 / Fable 5.1 family)**

- **Blocking:** forced `tool_choice: {type: 'tool'}` in `_submitOnce` and
  `classify` returns a 400 on `claude-opus-5-5`, `claude-sonnet-5-5` and
  `claude-fable-5-1`. Bumping `analysis.model` to any of those in Settings would
  fail every run. `claude-opus-5` does not carry that restriction.
- **Clean:** re-grep found no `thinking`, `temperature`, `top_p`, `top_k` or
  `budget_tokens`. `cache_control: ephemeral` on the system prompt is supported.
- **Needs attention on the 5.5 family:** thinking is always on and its tokens
  count against `max_tokens` (raises the truncation risk); effort defaults to
  `medium` and should be set explicitly; `classifyWithWebSearch` uses
  `web_search_20250305` where the docs recommend `web_search_20260209` — whether
  the older type is still accepted on 5.5 was not confirmed.

**Decision:** small PR targeting Opus 5 first: add the missing ids and current
rates to `MODEL_RATES`, update `DEFAULTS.model`, trial `claude-opus-5` for one
week and compare with `analysis-quality-review` before deciding on 5.5.
Migrating the client off forced tool use is a separate, later change.

## 2. Logs & Errors

- **Failed analysis runs:** 0 of the 12 most recent. No error classes to report.
- **Cadence:** runs land 5–9 days apart at varying hours, which looks manually
  triggered rather than timer-driven.
- **Audit entries (20 newest):** 14 `price_refresh` (source: timer) and 6
  `update_position` (source: MCP, 4 of them with the confirm flag). No unexpected
  writers.
- **Standing price-refresh failure:** all 14 refresh entries had at least one
  failed symbol — one per run on 13 of them, five on one run (2026-10-22). This
  is a persistent, unfixed failure.
- **Fix-commit proxy:** 14 `fix:` commits in the last 60. The most recent (#61)
  retries truncated or invalid LLM output.
- **CI:** `pr-checks.yml` 5 of 5 recent runs green. `deploy-azure-function.yml`
  3 of 3 recent runs green, latest 2026-08-15.
- **App Insights (`my-finances-func`, owner-approved, read-only, 30 days):**
  0 exceptions. Telemetry is present (210 traces, 15 requests), but all 210
  traces are severity 1 (information) — zero warnings or errors. So the standing
  price-refresh failure above is not visible in App Insights at any alertable
  severity.

## 3. Code-Quality Findings (via /code-review)

Targets: `src/application/use-cases/analysis`, `src/infrastructure/llm`,
`src/functions/mcp.js`. A first `low` pass returned no findings but ran only 3
tool calls in ~12 s, so it was treated as unverified and re-run at `medium`,
which returned 9 findings. Two (retry usage loss, cost ignoring cache tokens)
were spot-checked against the code and confirmed; the rest are as reported by
the reviewer, not independently verified.

Triage: the owner chose "ad-hoc fix" for the refresh failure and the re-run; the
findings below were not individually tagged. The tag shown is this run's
recommendation, not the owner's decision.

| # | Location | Finding | Recommended tag |
| --- | --- | --- | --- |
| 1 | `GenerateWeeklyAnalysis.js:427` | Entity construction runs after the paid LLM call, outside its try/catch; a validation throw leaves no failed row and loses the cost. | ad-hoc fix |
| 2 | `AnthropicLLMClient.js:148` | If the retry fails with `LLMRequestError` (no `.usage`), the first attempt's spend is dropped; failed row records zero cost. | ad-hoc fix |
| 3 | `AnthropicLLMClient.js:130` | Truncation retry doubles `maxOutputTokens` with no ceiling; can exceed the model or non-streaming limit, or become NaN if undefined. | ad-hoc fix |
| 4 | `AnthropicLLMClient.js:201` | Cost uses only `input_tokens`/`output_tokens`; cache creation/read tokens are ignored, so `costUsd` and `tokensIn` are understated while `cache_control` is on. | ad-hoc fix |
| 5 | `AnthropicLLMClient.js:383` | `classify` / `classifyWithWebSearch` never check `stop_reason` (`max_tokens`, `pause_turn`); errors carry no usage; web-search fee not counted. | ad-hoc fix |
| 6 | `AnthropicLLMClient.js:414` | The local schema validator ignores `maxLength`, `maxItems`, `pattern`, `additionalProperties`, integer/boolean types, and treats null/undefined as present for `required`. | speckit feature (touches retry-with-feedback) or ad-hoc |
| 7 | `mcp.js:258` | Argument handling inconsistent across tools (`notes` cannot be cleared, `index`/`limit` passed raw, `get_weekly_analysis` errors lack a `code`). | ad-hoc fix |
| 8 | `GenerateWeeklyAnalysis.js:322` | Some failed rows omit already-computed data; the FX-degraded failure omits earmarked positions, which can produce a spurious chart step. | ad-hoc fix |
| 9 | `GenerateWeeklyAnalysis.js:127` | The freeze guard fails open: a transient storage error on `getByDate` lets the analysis re-run and overwrite recorded execution statuses. | ad-hoc fix (highest priority: destructive) |
| 10 | `GenerateWeeklyAnalysis.js:281` | If the earmarked-brokers setting changes between weeks, the prior-snapshot diff shows spurious adds/removes. | ad-hoc fix |

## 4. Prompt Review

- Reviewed `guardrail-preamble-v2.md` (~2.4 KB) and `guardrails.js`
  (`buildSystemPrompt` = preamble + owner body).
- **The DB-stored instructions body was not provided.** No wording feedback on it.
- Observations: rules 2 and 4 overlap ("be concise" appears in both); rule 2 uses
  `MUST`/`NOT` emphasis, which the 5.x migration notes flag as often
  over-prescriptive for newer models; rule 3 says non-conforming output is
  "recorded as failed", which is only partly true since #61 added one retry.
  Rule 3 already names `submit_analysis` explicitly, which helps if the client
  later moves to `tool_choice: auto`.
- **Decision:** preamble ideas only (merge rules 2 and 4, soften emphasis, update
  rule 3 for retries). None applied. Preamble changes are code PRs, not Settings
  tweaks.
- For a content-level judgment of recommendation quality, use
  `analysis-quality-review`. Not run here.

## 5. Token Consumption

- Real usage is not observable: `get_weekly_analysis` and
  `list_weekly_analyses` omit `tokensIn`, `tokensOut`, `costUsd`, `attempts` and
  `stopReason`, although the entity stores them.
- Structural proxy (approximate, read by eye): `markdownBody` was about 4.5k
  characters (2026-09-12), about 4.3k (2026-10-10), about 2.9k (2026-10-24); 5
  sections each time. Trending shorter.
- The static system prompt is roughly 10 KB (preamble plus the repo's default
  body; the live body may differ), about 2.5k tokens by estimate. That is likely
  below the minimum cacheable prefix on larger models, and weekly cadence
  outlasts the 5-minute cache TTL, so `cache_control` probably helps only on
  retries within a single run. Unverifiable without usage data.
- Finding #4 above means whatever cost is stored is understated when caching does
  apply.
- **Decision:** expose the stored usage fields (`tokensIn`, `tokensOut`,
  `costUsd`, `attempts`, `stopReason`) through `get_weekly_analysis`. Fuller
  observability (eval harness, OpenTelemetry `gen_ai` span) stays as described in
  `docs/research/foundry-feasibility.md`, not chosen this run.

## 6. Feature Ideas & Backlog Reconciliation

Re-derived from code this run, not quoted from the roadmap:

- **Shipped (roadmap is stale on these):** `DuplicateHoldingsDetector` is present
  in `src/domain/services/` (the roadmap still calls it absent); the
  `@tailwindcss/typography` plugin is installed and enabled; the dividend and
  maturity calendar (spec 017) and MCP write tools (spec 018) exist; ESLint and
  Prettier config are present.
- **Still open:** what-if simulation (no simulation code found; the roadmap's
  "~spec 018" numbering is stale because 018 is now MCP write tools).
- **Could not verify from code:** scorecard outcome P&L (search only matched
  scorecard plumbing); backlog items B1, A3, B2–B4 (instruction-body edits that
  live in the DB); refactor rounds 1 and 2.
- **New ideas from this run:** expose usage fields via MCP (chosen); age out or
  escalate repeated pending orders (the same two low-conviction orders were
  re-issued across several consecutive weeks, and one marked skipped came back);
  surface swallowed timer failures on the dashboard or at warning severity.
- **Owner's pick from the menu:** "expose usage fields via MCP" only. Order
  aging and what-if simulation were offered and not selected. The Opus 5 trial
  was already decided in Section 1.
- `docs/roadmap-2026-07.md` itself needs a refresh to match the above.

## 7. Decisions Made This Run

| Question | Answer |
| --- | --- |
| Model direction | Small PR, target Opus 5 first. |
| Standing refresh failure and thin review | Ad-hoc fix; re-run review at medium (done). |
| App Insights query | Yes; discover the component with a read-only `az` listing (done). |
| Prompt review | Preamble ideas only; no body paste. |
| Token direction | Expose usage fields via MCP. |
| Backlog menu | Expose usage fields via MCP only. |

## 8. Open Questions / Deferred

- Claude-lineup facts (ids, rates, migration notes) were current as of the
  `claude-api` skill's cache date, 2026-10-06; re-check before acting.
- `analysis.imfModel` on the Function App was not read; the IMF classifier model
  is unconfirmed.
- Whether `web_search_20250305` is still accepted on the 5.5 family is unconfirmed.
- The DB-stored instructions body was not reviewed.
- The 10 code-review findings are untriaged individually; only the refresh
  failure was tagged by the owner.
- The cause of the standing refresh failure was not investigated (symbol-level
  detail stays out of this report).
- Real token spend remains unknown until the usage fields are exposed.
