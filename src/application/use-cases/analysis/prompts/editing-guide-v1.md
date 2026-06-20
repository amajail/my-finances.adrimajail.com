# Editing the analysis instructions — a short guide

Your saved text below the guardrail preamble is the **owner-maintained body** of
the analysis system prompt. The effective prompt the model receives is:

> **fixed guardrail preamble** ⊕ **your body**

You can edit the body freely; you cannot edit or remove the preamble.

## What your body controls

- The strategic framework, standing directives, deploy priorities, and tone.
- How the model should interpret the data and what to emphasise in the narrative.
- The structure and voice of the prose `markdownBody` (executive summary, market
  interpretation, reasoning).

## What you do NOT control here (owned by code / the preamble)

- **The numbers.** Bucket drift, asset-class drift, and concentration caps are
  computed in code from your holdings + the machine-readable targets
  (`analysis.allocationTargetsV1`). Editing the body cannot change that math, and
  the model is instructed not to recompute or restate those tables.
- **Output shape.** The `submit_analysis` tool schema enforces the structure. If
  your instructions push the model to emit something off-schema, the run fails
  cleanly and is recorded as failed — it does not corrupt stored data.

## Tips to avoid failed or misleading runs

- Don't ask the model to "calculate" allocations or drift — those are provided.
  Ask it to *interpret* them.
- Don't instruct it to include holdings or figures "from memory" or "from last
  week"; it must use only the data in each run.
- Keep the body focused on judgment and narrative. Tabular content now renders as
  tables automatically, so you can remove prose sections that just restated
  weights, drift, or cap call-outs.
- Every save is versioned in History — if an edit makes runs worse, restore the
  previous version.

## Saving tokens (cost levers you control)

Each run is a paid model call; output is priced several times higher than input.
The system already trims the prompt and asks for a concise narrative, but the two
biggest levers are yours:

- **Trim this instructions body.** It is the largest variable contributor to each
  run's token count. Remove prose that restates what the tables now show, and
  avoid asking for long, multi-section narratives. Shorter instructions → cheaper
  runs, every week.
- **Choose the model.** The `analysis.model` setting controls which model runs.
  A cheaper tier (for example `claude-sonnet-4-6`) costs roughly 5× less for both
  input and output, at the cost of some reasoning quality — reasonable on quiet
  weeks, while keeping the top tier for rebalance weeks. The default stays the
  high-quality model; switching is a settings change, no code required.
- **Cap the output.** `analysis.maxOutputTokens` sets a hard ceiling on how much
  the model may write in one run.
