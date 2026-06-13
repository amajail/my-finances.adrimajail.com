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
