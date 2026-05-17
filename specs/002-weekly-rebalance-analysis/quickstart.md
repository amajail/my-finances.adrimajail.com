# Quickstart — Local dev & manual test

This recipe walks through running the weekly analysis end-to-end locally before any deployment. Assumes the existing repo is already cloned and the daily price refresh (feature 001) works locally.

## Prerequisites

- Node.js ≥ 18, npm.
- Azurite running (tables emulator). Existing setup.
- Azure Functions Core Tools (`func` CLI), installed for feature 001.
- An Anthropic API key with sufficient credit (~$0.20 for one local test run).

## One-time setup

```bash
# Backend: install the new SDK
npm install @anthropic-ai/sdk

# Dashboard: install the new markdown libs
cd dashboard
npm install marked dompurify
cd ..

# Local config: add the API key to local.settings.json (gitignored)
# Edit local.settings.json — add under Values:
#   "ANTHROPIC_API_KEY": "sk-ant-..."
#
# local.settings.json.example is updated to document the slot — DO NOT
# commit a real key.
```

## Seed prerequisites

The use-case reads `portfolioSettings` for `analysis.model`, `analysis.promptVersion`, `analysis.maxInputTokens`, `analysis.maxOutputTokens`. Add seed values:

```bash
# From repo root, with Azurite + function host running:
curl -X PUT http://localhost:7071/api/settings/analysis.model \
  -H 'Content-Type: application/json' \
  -d '{"value": "claude-opus-4-7"}'

curl -X PUT http://localhost:7071/api/settings/analysis.promptVersion \
  -H 'Content-Type: application/json' \
  -d '{"value": "weekly-rebalance-v1"}'

curl -X PUT http://localhost:7071/api/settings/analysis.maxInputTokens \
  -H 'Content-Type: application/json' \
  -d '{"value": "80000"}'

curl -X PUT http://localhost:7071/api/settings/analysis.maxOutputTokens \
  -H 'Content-Type: application/json' \
  -d '{"value": "8000"}'
```

(If `PUT /api/settings/{key}` doesn't yet exist as written, use the existing pattern from `src/functions/settings.js` — the seed shape is whatever that endpoint accepts.)

## Run the timer locally

Azure Functions Core Tools doesn't fire timers on schedule in local dev unless you explicitly invoke them. Two options:

### Option A — Invoke via the admin endpoint

```bash
# With the function host running on localhost:7071
curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer \
  -H 'Content-Type: application/json' \
  -d '{"input":""}'
```

Watch the function host's stdout. You should see:
- A line indicating the riesgo-país fetch.
- A line indicating the Anthropic SDK call (with token counts logged at the end, NEVER the prompt/response body).
- A line indicating the persistence step.

### Option B — Trigger the daily price refresh first, then the timer

If your local Azurite has no positions, the analysis will be uninteresting. Make sure `portfolioPositions` has at least a few seed rows (use the template `scripts/positions.template.json`, NOT real holdings).

## Verify the result

```bash
# List analyses (most recent first)
curl http://localhost:7071/api/analysis/weekly | jq

# Fetch today's run (replace with the actual date)
curl http://localhost:7071/api/analysis/weekly/2026-05-16 | jq
```

The detail response should include `status: "completed"`, a non-empty `markdownBody`, a non-empty `orders` array (or an explicit "no actions" narrative), token counts, and a non-zero `costUsd`.

## View on the dashboard

```bash
cd dashboard
npm run dev
# Open http://localhost:4321/analysis
# Click into the latest entry to see the rendered narrative + orders table.
```

The detail page renders the markdown with `marked` and sanitizes with `DOMPurify`. There are no buttons or input controls — it's a read-only viewer per FR-024.

## Re-run safely

Invoke the timer a second time on the same day:

```bash
curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer \
  -H 'Content-Type: application/json' \
  -d '{"input":""}'
```

The previous row for `2026-05-16` is overwritten; orders are replaced with the new run's output. No merge semantics; no surprise loss (orders carry no user-managed state).

## Verify failure handling

Disconnect from the network (or set a wrong endpoint for argentinadatos in code temporarily) and re-invoke the timer. The dashboard list should show a `failed` entry with the reason. The detail page renders the failure entry with the error message in place of the narrative.

## Verify logging hygiene

```bash
# Tail the function host stdout while invoking the timer:
func start | grep -E "weeklyAnalysis|analysis"
```

You should see log lines containing `tokensIn=…`, `tokensOut=…`, `costUsd=…`, `status=…`, `durationMs=…` — and NEVER any line containing a portfolio symbol, a PPC value, or the narrative body. If you do, the `LLMLogSanitizer` is misconfigured — fix before deploying.

## Deploy

Standard pipeline. The `deploy-azure-function.yml` workflow picks up `src/functions/weeklyAnalysisTimer.js` automatically (Azure Functions v4 reads `app.timer(...)` registrations). The `deploy-dashboard.yml` workflow picks up the new Astro pages.

After deploy:
- Set `ANTHROPIC_API_KEY` in the Function App's Application Settings (Azure Portal → Function App → Configuration). Do NOT bake it into the deployment.
- Verify the `TZ` app setting is still `America/New_York` (already set by feature 001).
- Wait for the next Friday at 17:00 ET; the dashboard should show the new entry within 30 minutes per SC-001.

## What if I need to re-run an already-deployed week manually?

Azure Portal → Function App → Functions → `weeklyAnalysisTimer` → "Test/Run" (or "Code + Test" → Run). Provide an empty input `{}`. The run overwrites the existing row for the current date. No HTTP endpoint exposes this trigger to the network.
