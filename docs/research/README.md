# docs/research

Research notes, spikes, and feasibility analyses — exploratory material that informs
future features but is not itself a spec or plan. Docs here may describe designs that
were researched but never implemented; each should carry a status line saying so.

Contents:

- `foundry-feasibility.md` — Microsoft Foundry assessment for the weekly analysis:
  real API costs, evals design, tracing/observability, multi-model testing (2026-07).
- `llm-provider-abstraction.md` — model-agnostic LLM layer: current Anthropic client
  contract + agreed router/adapter design (researched 2026-07, not implemented).
- `system-assessment-2026-10-28.md` — LLM-surface assessment: model version vs lineup,
  API compatibility, logs/CI, code review, prompt, token observability, backlog.

Conventions: no real holdings data (quantities, PPCs, account identifiers) — aggregate
API costs and architecture detail only. Speckit features live in `specs/`, not here.
