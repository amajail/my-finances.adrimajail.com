# Microsoft Foundry feasibility — weekly analysis

Assessment of moving the weekly portfolio analysis to Microsoft Foundry: costs, evals,
tracing/observability, and multi-model testing. Researched 2026-07-23 against
learn.microsoft.com / platform.claude.com docs (source links inline). No code changes
made; this document is the deliverable.

---

## 1. Current state and real costs

The weekly analysis is a **deterministic pipeline, not an agent**: freeze guard →
settings → portfolio snapshot → pure domain calculators (drift, duplicates, changes,
macro) → **one** forced-structured-output Claude call → persist. The LLM sits behind a
single DI seam (`container.getLLMClient()` → `AnthropicLLMClient`), which is the only
place a platform change would touch. It uses three Anthropic features: forced
`tool_choice` (structured output), `cache_control` prompt caching, and the server-side
`web_search` tool (IMF macro sub-call).

### Actual costs (from `portfolioAnalysis` telemetry, May–Jul 2026)

Excluding the 6 zero-cost macro-only backfill rows, the 12 real LLM runs:

| Metric | Value |
|---|---|
| Avg input tokens / run | ~15,500 |
| Avg output tokens / run | ~5,200 |
| Avg cost / run | **~$0.51** |
| Range per run | $0.33 – $0.75 |
| Avg duration | ~85 s |
| Total spent (12 runs) | $6.06 |
| **Annualized (52 runs)** | **~$26** |

Models used: `claude-opus-4-7` (most runs), `claude-opus-4-8` (latest, notably cheaper
at $0.33). The pre-call cost cap (`maxInputTokens` 80K) has never been approached.

**Cost conclusion: Foundry does not change this number.** Claude on Foundry bills at
Anthropic's published per-model token rates, converted to "Claude Consumption Units"
on the Azure Marketplace invoice — "a change in billing format, not in price"
([CCU billing](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/claude-models-billing)).
The Foundry value is **billing consolidation** (one Azure invoice, MACC-eligible) and
**auth** (Entra ID / managed identity instead of a stored `ANTHROPIC_API_KEY`), not
savings. One negative: the Batches API is unsupported on Foundry, which forecloses the
50%-off batch pricing path if eval replays ever get large.

---

## 2. Option A — Route the existing call through Foundry

**Feasibility: HIGH. Effort: small.** Claude is GA in Foundry (July 2026): you deploy a
Claude model from the catalog into a Foundry resource, accept the Marketplace offer
once, and call the **native Anthropic Messages endpoint**
(`https://{resource}.services.ai.azure.com/anthropic/v1/messages`) via the official
Node client `@anthropic-ai/foundry-sdk` (`AnthropicFoundry` — same `messages.create`
surface as the current SDK)
([deploy & use Claude](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude),
[Anthropic Foundry docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry)).

Change surface: a `FoundryLLMClient` (or constructor option on `AnthropicLLMClient`)
behind `getLLMClient()`; Function App managed identity with scope
`https://ai.azure.com/.default` (zero stored secrets), or an Azure API key.

**The one caveat that matters — hosting flavor.** Each Claude model ships in two
flavors on Foundry:

| | Hosted on Azure (GA) | Hosted on Anthropic |
|---|---|---|
| Models | opus-4-8, sonnet-5, haiku-4-5 | those + fable-5 (preview) + older models |
| Forced tool_use / structured outputs | **❌ returns 400** | ✅ |
| Server-side web search (IMF sub-call) | **❌** | ✅ |
| Prompt caching, streaming, PDF/vision | ✅ | ✅ |

The weekly analysis needs structured outputs *and* web search, so it must target the
**Anthropic-hosted flavor**. Verify in the portal at deploy time — the feature matrix
moves fast (docs dated 2026-07-20).

Other gaps: no Models API, no Admin API, no server-side fallbacks, no
`anthropic-ratelimit-*` headers. Default PAYG limits (40 RPM / 40K TPM on Opus) are
irrelevant at one call per week.

---

## 3. Option B — Foundry Agent Service: not viable, and not a fit

Two independent blockers:

1. **Claude cannot back a Foundry Agent Service agent.** Per a Microsoft staff answer,
   catalog-deployed Claude models are not supported by Agent Service's `create_agent`
   API — only Azure OpenAI and select Azure-sold models, with no announced timeline
   ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5861158/can-claude-models-be-used-with-foundry-agent-servi)).
   GA marketing language is ambiguous on this; treat any "Agent Service support for
   Claude" claim as needs-verification in the portal, but assume no.
2. **Architecture mismatch regardless of model.** The pipeline's value *is* its
   determinism — the freeze guard, settings-driven config, reproducible calculators,
   schema-enforced output, cost caps, audit columns, prompt versioning. Rebuilding it
   as a hosted agent means re-exposing all of that as tools and letting a model drive
   the orchestration: more tokens, less reproducibility, nothing gained for a
   single-shot weekly job.

Closed: skip Agent Service.

---

## 4. Traces and observability

What the Foundry portal actually provides, split by how you call the model:

- **Server-side, zero-code tracing exists only for agents hosted in Foundry**
  (Prompt/Host agents, workflows). A plain Node app calling a Claude deployment gets
  **no portal traces** out of the box
  ([trace setup](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-setup)).
- The **Monitoring tab** does give per-model token usage and request counts
  server-side with no instrumentation — metrics, not prompt-level traces.
- To get real traces (prompt, completion, tokens, latency per call) in the portal's
  Traces view, the **client must emit OpenTelemetry spans** (GenAI semantic
  conventions) to the Application Insights resource connected to the Foundry project.
  Microsoft documents first-class instrumentation for LangChain, OpenAI Agents SDK,
  Agent Framework, and Python — **not** for the Anthropic Node SDK. Options: a manual
  `gen_ai.*` span around `submitAnalysis` (simple, one call site), or third-party
  OpenLLMetry/OpenInference JS instrumentation (needs verification that its attributes
  render in the Foundry UI rather than only raw App Insights).

**Key insight: the same OTel span can be pointed at the Function App's existing
Application Insights today, without Foundry.** For one call/week, a manual span
carrying model, tokensIn/Out, costUsd, durationMs (all already computed by the
pipeline) delivers ~all the observability value; the analysis row itself is already a
better audit record than any trace. Trace cost is ordinary App Insights ingestion —
pennies at this volume.

---

## 5. Evals for the weekly analysis

Every analysis row already stores its full inputs (`portfolioSnapshotJson`,
`macroContextJson`, instructions version) and outputs (summary, markdown, orders,
watchlist, token/cost telemetry) — **the eval dataset already exists in Table
Storage.** Design, cheapest-first:

### 5a. Deterministic code evaluators (build first — free, highest value)

The domain is rule-based, so most quality checks are plain asserts over stored JSON,
no judge model needed:

- **Cap compliance**: no suggested `buy` for a symbol the same run flags over the
  single-issue cap; no ARG-sov adds while the block is active.
- **Macro-trigger consistency**: trigger firings in the narrative match the stored
  macro values against the framework thresholds (e.g. riesgo país vs 600 bp).
- **Referential validity**: every order's broker/symbol exists in the run's snapshot
  (or is explicitly introduced); quantities positive; no orders for administrative or
  earmarked stubs.
- **Continuity**: re-issued orders actually correspond to prior-week unexecuted
  orders; week-over-week claims match `positionChangesJson`.
- **Schema/structure**: required sections present, orders array consistent with the
  markdown.

A run of these across all stored analyses gives a scored regression suite for free.

### 5b. LLM-judge evaluators (second layer)

For qualities code can't check — narrative faithfulness to the data blocks, framework
adherence against the (versioned) instructions doc, clarity:

- **Foundry route**: `azure-ai-evaluation` (**Python SDK** — there is no Node
  version; the harness is a sidecar, e.g. `scripts/evals/`, with gitignored data).
  `evaluate()` runs **offline over a JSONL of stored query/response pairs** — exactly
  the export from 5a's dataset — and can log results to the Foundry portal. Built-in
  quality evaluators (coherence, fluency, groundedness, relevance…) require a
  **GPT-family judge** (`gpt-4o`, `gpt-4o-mini`, …) — Claude-as-judge is not
  supported by the built-ins
  ([evaluation SDK](https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/develop/evaluate-sdk?view=foundry-classic)).
- **Custom evaluators** are arbitrary callables, so a Claude-judging-Claude (or
  Claude-judging-GPT) rubric evaluator is straightforward if judge choice matters.
- **Cost**: judge tokens only, no platform surcharge; grading 52 analyses/year with a
  small judge model is well under $1. Continuous/scheduled evals and Azure Monitor
  alerts exist but are trace/agent-oriented — overkill at this volume.

The 5a+5b harness works **regardless of where inference runs** — it reads from Table
Storage and calls whatever judge endpoint you configure.

---

## 6. Multi-model testing (GPT, Grok, Llama, …)

This is Foundry's genuinely differentiating capability for this project: one resource,
one invoice, and the whole model catalog (Azure OpenAI GPT-5.x, Grok, Llama, Mistral,
DeepSeek, Claude…) deployable side by side. Direct-Anthropic cannot offer this.

What it takes, in order:

1. **Provider adapter** — the DI seam already isolates the LLM, but
   `AnthropicLLMClient` is Anthropic-native (forced tool_use). Non-Claude models need
   an OpenAI-style chat-completions call with `response_format: json_schema` mapped to
   the same `submitAnalysis({systemPrompt, userMessage, toolSchema, …})` contract. One
   new client class + a provider field alongside the existing `analysis.model`
   setting.
2. **Replay, don't switch** — re-run stored historical inputs (the same JSONL export
   from §5) through candidate models **offline**, score every output with the §5
   harness (deterministic checks + judge), and compare models on identical inputs.
   Cost of a full replay: ~12 historical runs × candidate models × ~$0.05–0.50/run
   depending on model — single-digit dollars per candidate.
3. Only after a candidate wins on the eval scores, point the Friday timer at it via
   the settings row.

Note the IMF `web_search` sub-call is Anthropic-specific; on non-Claude models that
sub-feature would need a different mechanism (or stay on Claude while the main call is
swapped — they're independent calls).

---

## 7. Recommendation

Ordered by value-per-effort:

1. **Build the eval harness first (§5)** — works today with zero Foundry dependency,
   is free for the deterministic layer, and is a hard prerequisite for any credible
   multi-model comparison anyway.
2. **Adopt Foundry when starting the multi-model experiments (§6)** — that's the
   moment its catalog + consolidated billing + Entra auth pay off. Deploy Claude on
   the **Anthropic-hosted flavor** (structured outputs + web search) plus candidate
   models in one resource; swap the client behind `getLLMClient()`.
3. **Skip Foundry Agent Service** (§3) — Claude isn't supported and the architecture
   doesn't want it.
4. **Add a minimal OTel `gen_ai` span** around `submitAnalysis` whichever path is
   taken (§4) — it lights up either App Insights today or the Foundry Traces view
   later.

### Portal verification checklist (before any Foundry spike)

- [ ] Structured outputs / forced tool_use available on the chosen model's
      **Anthropic-hosted** deployment (docs say yes; Azure-hosted says 400).
- [ ] Server-side `web_search` available on that deployment (IMF sub-call).
- [ ] Prompt caching honored via the Foundry endpoint (cache-read tokens in usage).
- [ ] Current Agent Service model list (confirm Claude still absent).
- [ ] `azure-ai-evaluation` judge-model list (still GPT-only?) and Foundry
      Observability pricing meters for safety evaluators (pricing page timed out
      during research).

### Sources

- [Claude models in Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/claude-models)
- [Deploy and use Claude in Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude)
- [Claude Consumption Units billing](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/claude-models-billing)
- [Claude in Microsoft Foundry — Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry)
- [Foundry observability concepts](https://learn.microsoft.com/en-us/azure/foundry/concepts/observability)
- [Trace setup](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-setup)
- [azure-ai-evaluation SDK](https://learn.microsoft.com/en-us/azure/ai-foundry/how-to/develop/evaluate-sdk?view=foundry-classic)
- [Claude + Agent Service — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5861158/can-claude-models-be-used-with-foundry-agent-servi)
- [Anthropic: Claude in Microsoft Foundry](https://www.anthropic.com/news/claude-in-microsoft-foundry)
