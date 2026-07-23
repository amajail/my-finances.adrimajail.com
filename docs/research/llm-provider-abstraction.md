# Research: model-agnostic LLM layer (provider abstraction)

**Status: researched 2026-07-23, NOT implemented.** First-pass scope agreed with the
owner: provider abstraction + one OpenAI-compatible adapter (no replay script yet).
Goal: remove the hard dependency on Anthropic models so other models (GPT, Grok,
Llama, DeepSeek — via OpenAI-compatible endpoints incl. Foundry, OpenRouter, Ollama)
can be tested and compared with evals. Companion doc: `foundry-feasibility.md`.

---

## 1. Current LLM contract (as of 2026-07-23)

The abstraction must preserve this contract exactly.

### Interface

`src/application/interfaces/ILLMClient.js` — abstract `submitAnalysis(input)`,
`classify(input)`, `classifyWithWebSearch(input)`. Note: its `LLMResult` typedef is
stale — it omits `watchlist/weekOverWeek/frameworkAmendments`, which the real client
returns.

### `src/infrastructure/llm/AnthropicLLMClient.js`

- Ctor `{ sdkClient = null, apiKey = null }`; key defaults to
  `process.env.ANTHROPIC_API_KEY`; SDK lazily required, missing key throws at call
  time (`'ANTHROPIC_API_KEY is not configured'`).
- `submitAnalysis({ systemPrompt, userMessage, toolSchema, model, maxInputTokens,
  maxOutputTokens })`:
  - Pre-call cost cap: `estimatedInput = ceil(((system.length + user.length) / 4) * 1.2)`
    → `CostCapExceededError` if `> maxInputTokens`.
  - `messages.create` with `system: [{type:'text', text, cache_control:{type:'ephemeral'}}]`,
    one tool from `toolSchema` (`name || 'submit_analysis'`), forced
    `tool_choice:{type:'tool', name}`.
  - Extracts the `tool_use` block, validates against the schema
    (`_validateAgainstSchema`), returns
    `{ summary, markdownBody, orders (||[]), watchlist|null, weekOverWeek|null,
    frameworkAmendments|null, usage:{inputTokens, outputTokens, costUsd(4dp)} }`.
- `classify({ systemPrompt, userMessage, toolSchema, model, maxOutputTokens })` —
  no cost cap, default max_tokens 256, forced tool_choice, returns
  `{ result: toolBlock.input, usage:{... costUsd(6dp)} }`.
- `classifyWithWebSearch({ ..., maxSearches })` — adds Anthropic server tool
  `{type:'web_search_20250305', name:'web_search', max_uses: maxSearches||4}`,
  `tool_choice:{type:'auto'}` (search must be allowed to run first). Same return
  shape as `classify`.
- `MODEL_RATES` (USD per 1M tokens): opus-4-8/4-7/4-6 = 5/25; sonnet-5, sonnet-4-6 =
  3/15; haiku-4-5 = 1/5. `DEFAULT_RATES` = 5/25 fallback.
- `_validateAgainstSchema`/`_validateNode`: minimal recursive JSON-Schema subset
  (object required/properties, array minItems/items, string minLength/enum, number
  exclusiveMinimum).
- Exports error classes **from this file**: `CostCapExceededError`,
  `LLMSchemaValidationError`, `LLMRequestError` (carries `.sanitized`) — imported by
  `GenerateWeeklyAnalysis.js` (~lines 31-35) for catch-branching into persisted
  `failed` rows. Errors sanitized via `src/infrastructure/llm/LLMLogSanitizer.js`.

### Call sites

| Caller | Method | Model source |
|---|---|---|
| `src/application/use-cases/analysis/GenerateWeeklyAnalysis.js` ~359 | `submitAnalysis` | settings `analysis.model` (default `claude-opus-4-7` in DEFAULTS; prod currently opus-4-8) |
| `src/infrastructure/providers/WebSearchImfStatusProvider.js` ~58 | `classifyWithWebSearch` | env `process.env['analysis.imfModel']` via DI container ~262 |
| `src/infrastructure/providers/ImfStatusProvider.js` ~187 | `classify` | same |

DI seam: `container.getLLMClient()` (`src/application/di/container.js` ~292) —
singleton `new AnthropicLLMClient()`, injected into GWA wiring and
`WebSearchImfStatusProvider`. **Single place to introduce routing.**

### Tool schemas are plain JSON Schema

- `specs/002-weekly-rebalance-analysis/contracts/submit-analysis-tool.json` —
  Draft-2020-12; `{name:'submit_analysis', description, input_schema}` with required
  `summary/markdownBody/orders`, optional `watchlist/weekOverWeek/frameworkAmendments`.
- `src/infrastructure/llm/imfClassifyTool.js` — `{name:'submit_imf_status', ...}`.
- Both map directly to OpenAI function calling (`parameters: input_schema`). Caveat if
  ever using OpenAI *strict* structured outputs: strict mode requires every property
  in `required`, which the optional arrays violate — plain (non-strict) function
  calling + our own validator avoids the rework.

### Tests / mocks

- `tests/unit/infrastructure/llm/AnthropicLLMClient.classify.test.js` — injects
  `sdkClient = {messages:{create: jest.fn()}}`.
- GWA suites (9 files) use duck-typed mocks `{submitAnalysis: jest.fn()}` and import
  error classes from `AnthropicLLMClient` — error re-exports must be kept if errors
  move.
- No dedicated `submitAnalysis` or `classifyWithWebSearch` unit tests exist for the
  client.

### Deps / env

- `package.json`: `@anthropic-ai/sdk ^0.96.0` only; **no `openai` dep yet**.
- Env via `local.settings.json` Values → `process.env` (Function App app settings in
  prod). `dotenv` loaded in `src/shared/config/index.js`.

---

## 2. Proposed design (agreed, not implemented)

**Core idea: provider-prefix routing on the model string, transparent to all call
sites.** `analysis.model` (and env `analysis.imfModel`) may carry a prefix —
`openai:gpt-5-mini`, `anthropic:claude-opus-4-8`. No prefix → anthropic (full
back-compat with the stored setting). A router implementing `ILLMClient` parses per
call, strips the prefix, delegates. **Zero changes to GenerateWeeklyAnalysis, the IMF
providers, or their tests.**

### Files

1. `src/infrastructure/llm/errors.js` (new) — move the 3 error classes; re-export
   from `AnthropicLLMClient.js` for back-compat; switch GWA's import to `errors.js`.
2. `src/infrastructure/llm/schemaValidator.js` (new) — extract
   `validateAgainstSchema(input, schema)`; both adapters use it.
3. `src/infrastructure/llm/modelRates.js` (new) —
   `computeCostUsd(model, inTok, outTok, decimals)`: Anthropic table + small OpenAI
   table + optional env override `LLM_MODEL_RATES` (JSON map merged on top). Unknown
   model → cost `0` + one `logger.warn` (never a wrong $5/$25 guess).
4. `src/infrastructure/llm/OpenAILLMClient.js` (new) — extends `ILLMClient`:
   - Ctor `{sdkClient, apiKey, baseUrl}`; lazy `require('openai')`; env
     `OPENAI_API_KEY`, `OPENAI_BASE_URL` (default api.openai.com; point at
     Foundry/OpenRouter/Ollama for other models). Lazy key check like the Anthropic
     ctor.
   - `submitAnalysis`: same cost cap; `chat.completions.create` with
     `tools:[{type:'function', function:{name, description,
     parameters: toolSchema.input_schema}}]` and forced
     `tool_choice:{type:'function', function:{name}}`; `JSON.parse` the tool-call
     arguments (parse failure → `LLMSchemaValidationError`), validate, return the
     identical result shape; usage from `prompt_tokens/completion_tokens`.
   - `classify`: same pattern, 6dp cost, default max_tokens 256.
   - `classifyWithWebSearch`: throws `LLMRequestError('web search is not supported by
     the openai provider')` — IMF web-search stays pinned to Anthropic via its own
     `analysis.imfModel`; macro layer already degrades gracefully on IMF failure.
   - API errors wrapped in `LLMRequestError` + `LLMLogSanitizer`, mirroring Anthropic.
5. `src/infrastructure/llm/LLMClientRouter.js` (new) — extends `ILLMClient`; ctor
   `{providers:{anthropic, openai}}`; static `parseModel(model)` →
   `{provider, bareModel}` (explicit prefix wins; unknown prefix →
   `LLMRequestError`; bare → anthropic); delegates each method with the bare model.
6. `src/application/di/container.js` — `getLLMClient()` returns the router wrapping
   lazily-built adapter singletons. No signature change.
7. `src/application/interfaces/ILLMClient.js` — fix `LLMResult` typedef; document the
   prefix convention.
8. `package.json` — add `openai`.
9. `local.settings.json.example` — add `OPENAI_API_KEY`, `OPENAI_BASE_URL`
   placeholders (never touch the real `local.settings.json`).
10. `CLAUDE.md` — short note: `analysis.model` accepts `provider:model`; IMF
    web-search is Anthropic-only.

### Explicitly unchanged

GWA (except error-import path), both IMF providers, prompt assembly, persistence,
tool schemas, dashboard, endpoints. `@anthropic-ai/sdk` stays — model-agnostic means
no lock-in, not dropping Claude.

### Tests outline

- `OpenAILLMClient.test.js`: mock `{chat:{completions:{create}}}`; forced tool_choice
  + schema mapping; result-shape parity; missing/malformed tool call →
  `LLMSchemaValidationError`; cost cap; cost math incl. unknown-model → 0;
  `classifyWithWebSearch` → `LLMRequestError`.
- `LLMClientRouter.test.js`: prefix routing, bare-model default, unknown prefix,
  pass-through.
- Existing suites must pass unmodified.

### Rollout

- Branch: `feature/llm-provider-abstraction` off the `019-earmarked-positions` HEAD
  while PR #50 is pending (GWA overlap).
- After merge: switch models per-run just by editing the `analysis.model` settings
  row (e.g. `openai:<model>`); recommended path is **replay historical inputs offline
  + eval scoring first** (see `foundry-feasibility.md` §5-6), only then repoint the
  Friday timer.
