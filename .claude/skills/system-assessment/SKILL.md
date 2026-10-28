---
name: 'system-assessment'
description: "Periodic assessment of the app's whole LLM surface: model version vs the current Claude lineup, API compatibility, failing runs and CI, code quality, prompts, token spend, and the feature backlog. Use when a new Claude model ships or for a periodic LLM-surface review. Plan-only: writes one dated report, changes no code."
metadata:
  author: 'my-finances'
user-invocable: true
disable-model-invocation: false
---

# system-assessment

Steps back and assesses everything that touches the LLM in my-finances: which
model is configured, whether it is stale, whether recent runs fail, whether
the code and prompts around the LLM boundary are healthy, what token spend can
be observed, and which features are now worth building. This is a
**conversation, not a report dump**: investigate, then stop and brainstorm
with the owner at every `(B)` step before writing conclusions. It is plan-only
and human-in-the-loop — it never edits code, never commits without an
explicit yes, and the owner decides afterwards what gets implemented (speckit
or ad-hoc).

Follow these steps in order. `(R)` = read-only investigation, `(B)` = pause
and brainstorm.

## Rules for the whole run

- **MCP read whitelist:** `list_weekly_analyses`, `get_weekly_analysis`,
  `list_audit_entries` (all `mcp__my-finances__*`, deferred — load with
  `ToolSearch select:<name>` first).
- **Never call:** `update_position`, `create_position`,
  `set_order_execution_status`, `trigger_price_refresh`, or any broker
  connector tool. This skill has no business writing.
- **Bash whitelist:** `npm run test:unit`, `npm run lint`,
  `npm run format:check`, `git log`, `git diff` (informational), `gh run list`,
  `gh pr list`, and read-only `az` queries (Step 3, owner-approved).
- **Never run:** `npm run format` (mutates), `npm run test:coverage` (writes
  `coverage/`), `npm test` / `test:integration` (hit external network
  providers, so flaky and not a code-health signal).
- **Never** pass `--fix` or `--comment` to anything, never run `/simplify`
  (it edits code), never invoke speckit skills from inside this skill.
- **Privacy (hard rule, CLAUDE.md rule 1 + `docs/research/README.md`):**
  `get_weekly_analysis` and `list_audit_entries` return real holdings. The
  report must NEVER contain a symbol, quantity, PPC/`averageCost`, price of a
  holding, or account id — not even as an example. Structural and aggregate
  facts only (section headers, counts, model ids, error classes). Anything
  needing specifics stays verbal in the session.
- **Brainstorm mechanics (every `(B)` step):** load `AskUserQuestion` via
  `ToolSearch select:AskUserQuestion` if it is deferred. Ask with 2-4 concrete
  options and mark one "(Recommended)". If the tool is unavailable, print the
  same question as a plain-text numbered list (`1.`, `2.`, ...) with the
  recommended default marked, and wait for the owner's reply. Record each
  answer for Step 8; do not act on it.
- "What is current" Claude facts (lineup, ids, pricing, migration notes) are
  never hardcoded here and never answered from memory — they come from the
  `claude-api` skill at run time (Step 2). Say in Open Questions that they
  were current as of that skill's cache date.

## Step 1 — Establish the live baseline (R)

1. `list_weekly_analyses` (limit ~12). Note count, statuses, date cadence.
2. `get_weekly_analysis` for the newest `completed` date. Extract only
   `modelUsed`, the `markdownBody` section headers present, and the order
   count. Drop everything else — the narrative and orders carry real holdings.

Neither tool returns `tokensIn`/`tokensOut`/`costUsd`/`attempts`/`stopReason`
even though the `WeeklyAnalysis` entity stores them. That gap caps Steps 3 and
6; report it as a finding.

## Step 2 — Model-version check (R, then B)

Gather four model sources and compare each against the current lineup:

| Source           | Where                                                                                                                                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live `modelUsed` | Step 1                                                                                                                                                                                                                                                                                                         |
| Coded default    | `DEFAULTS.model` in `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` (the `analysis.model` Setting overrides it at run time; no MCP path reads that Setting)                                                                                                                                     |
| Cost table       | keys of `MODEL_RATES` (and `DEFAULT_RATES`) in `src/infrastructure/llm/AnthropicLLMClient.js`                                                                                                                                                                                                                  |
| IMF classifier   | `process.env['analysis.imfModel']` read in `getMacroContextProvider` in `src/application/di/container.js`; when unset, `DEFAULT_MODEL` in `src/infrastructure/providers/WebSearchImfStatusProvider.js`. Reading the Function App setting needs `az functionapp config appsettings list` — ask the owner first. |

Invoke the `claude-api` skill for the current lineup, ids and pricing, and
its migration notes. Produce a diff table: which sources are behind, which ids
are missing from `MODEL_RATES`. A missing id only skews `costUsd` (it falls
back to `DEFAULT_RATES`); the cost cap is token-based and unaffected.

**API-compatibility check** against those migration notes for the target
model. The LLM client depends on: forced `tool_choice: {type: 'tool'}` in
`_submitOnce` and `classify`, `cache_control: ephemeral` on the system prompt,
`max_tokens` as a truncation ceiling, `tool_choice: {type: 'auto'}` plus the
`web_search_*` server tool in `classifyWithWebSearch`, and no `thinking`,
`temperature`, `top_p`, `top_k` or `budget_tokens` (re-grep to confirm). Flag
every one the target model changes (rejected params, forced tool use removed,
thinking on by default, effort default, tool-type versions).

**Brainstorm:** options — (a) bump `analysis.model` via
`dashboard/src/pages/settings.astro` or `PUT /api/settings/analysis.model`
(`src/functions/settings.js`), no code change, only safe if the compatibility
check is clean; (b) small PR: new id in `MODEL_RATES`, update `DEFAULTS.model`
and any client changes the check demands; (c) stay; (d) provider question —
point to `docs/research/llm-provider-abstraction.md`. Also offer a trial: run
one week on the new model and compare outputs with `analysis-quality-review`
before switching for good. Recommend per the compatibility result.

## Step 3 — Logs and errors (R, then B)

- `list_weekly_analyses` rows with `status: "failed"` plus `errorMessage`
  (count and error classes only).
- `list_audit_entries` (limit ~20): skim for anomalies (failed refresh ratios,
  unexpected writers). Report counts and operations only — targets contain
  holdings.
- Fix proxy: `git log --oneline -60 | grep -iE "^[0-9a-f]+ fix"`.
- CI: `gh run list --workflow pr-checks.yml --limit 5` and
  `gh run list --workflow deploy-azure-function.yml --limit 3`.
- **Optional, owner-approved per run:** read-only App Insights
  (`az monitor app-insights query --app <name> --analytics-query "exceptions |
where timestamp > ago(30d) | summarize count() by problemId, outerMessage"`).
  This is the only source of runtime errors, since the timer handlers swallow
  failures into `context.log.error`. First check `command -v az` and
  `az account show`; if unavailable or the owner declines, say so and skip. The
  app name is in `CLAUDE.local.md`, else ask. Never run queries unasked and
  never write raw payloads into the report.

## Step 4 — Code-quality pass (R)

Delegate to `/code-review low` (or `medium`) on the fixed path targets
`src/application/use-cases/analysis`, `src/infrastructure/llm` and
`src/functions/mcp.js` — as path targets, never against a diff, never with
`--fix`/`--comment`. First confirm the paths exist. Hold findings for the
Step 3 checkpoint; do not fix anything.

**Brainstorm (shared with Step 3):** present failures, CI health and review
findings together. Options per item: track as ad-hoc fix, track as a speckit
feature, ignore. Recommend ad-hoc for small, speckit for cross-cutting.

## Step 5 — Prompt review (R, then B)

Read `src/application/use-cases/analysis/prompts/guardrail-preamble-v2.md`
(the active, committed preamble; v1 and `weekly-rebalance-v1.md` are older) and
`guardrails.js` (`buildSystemPrompt`). The owner-edited instructions body lives
in the DB and no MCP tool returns it: ask the owner to paste it if wording
feedback is wanted this run, and state in the report when it was not provided.

For a content-level judgment of whether recent recommendations were actually
good, run `analysis-quality-review` instead — do not re-derive that here.

**Brainstorm:** wording ideas as options, none applied. Note that preamble
changes are code PRs, not Settings tweaks.

## Step 6 — Token consumption (R, then B)

Only structural proxies are observable (Step 1 gap): `markdownBody` length and
section-count trend across the last few `get_weekly_analysis` calls — numbers
only, never content. Point at `docs/research/foundry-feasibility.md` (eval
harness + OpenTelemetry `gen_ai` span) as the real fix instead of re-deriving
one. A candidate feature to surface: expose the stored token, cost, attempts
and stop-reason fields through `get_weekly_analysis`.

**Brainstorm:** token-diet ideas as options, none applied.

## Step 7 — Feature brainstorm and backlog reconciliation (R, then B)

Re-derive backlog state live; never quote a doc or this skill as current fact.
Read `docs/roadmap-2026-07.md` and the memory project entries, then grep the
code for every item the roadmap calls missing or deferred (for example check
`src/domain/services/` for `DuplicateHoldingsDetector`; the roadmap has
claimed it absent after it shipped). List ideas that fall out of Steps 1-6.

**Brainstorm:** present a numbered menu of what is genuinely open plus new
ideas; the owner picks, the skill does not decide.

## Step 8 — Write the report (R)

Assemble only what Steps 2-7 already decided, using
`.claude/skills/system-assessment/report-template.md`. Write
`docs/research/system-assessment-YYYY-MM-DD.md` (run date). No new questions
here. Header records this session's own model id. Before saving, grep the
draft for tickers, numbers that look like quantities or prices, and account
ids; remove anything found.

## Step 9 — Close out (B)

Show the file path. Ask whether to commit it (ad-hoc work needs an explicit
yes per CLAUDE.md; branch `docs/…` off `main`, never commit to `main`) and
whether to add it to the Contents list in `docs/research/README.md`. Never
commit or push without that yes. End by restating what the owner chose to do
next.
