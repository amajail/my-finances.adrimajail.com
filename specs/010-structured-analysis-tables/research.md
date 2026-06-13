# Research — Structured Analysis Tables (feature 010)

Phase 0 decisions. The `/speckit-clarify` session already resolved the four
spec-level ambiguities; this document resolves the resulting **implementation**
unknowns, chiefly: where machine-readable allocation targets come from, and how
the guardrail preamble is stored and assembled.

---

## R1 — Source of machine-readable allocation targets (FR-001a)

**Context**: Bucket/asset-class targets and concentration caps exist today only
as prose inside the `analysis.strategicFrameworkV1` settings row, injected into
the prompt at the `{{strategicFramework}}` slot (`weekly-rebalance-v1.md:13`).
The hybrid clarification requires these computed deterministically in code, so a
machine-readable form is required.

**Decision**: Add a new `portfolioSettings` row **`analysis.allocationTargetsV1`**
holding a JSON document with bucket/class targets, their membership rules, and
concentration caps. Seed it from a committed placeholder
`scripts/allocation-targets.example.json` → owner copies to a gitignored
`scripts/allocation-targets.local.json` → `node scripts/seed-allocation-targets.js`
persists it. This mirrors the existing `seed-analysis-framework.js` pattern
exactly (template committed, real values local, idempotent insert).

**Rationale**: Deterministic and owner-owned; keeps real targets out of source
control (Privacy First); reuses an established seeding pattern; the calculator
becomes trivially unit-testable against fixture targets.

**Alternatives considered**:
- *Parse the prose framework into targets* — brittle (free-form markdown), and a
  parse slip silently miscalculates drift: precisely the "misleading numbers"
  risk the owner raised. Rejected.
- *Have the LLM emit the targets/drift* — defeats the determinism the hybrid was
  chosen to get, and re-introduces arithmetic into instruction control. Rejected.

**Sync note**: The owner must keep `allocationTargetsV1` consistent with the
prose framework. The quickstart documents this; not enforced in code (single
user). A future feature could derive one from the other.

---

## R2 — Bucket/asset-class membership + current-weight computation

**Context**: The example framework groups holdings into buckets (US / ARG /
OffSystem) and classes (ETFs, Equities, T-bills, Sovereign bonds, CEDEARs,
LECAP, USD cash…). Each `(bucket, class)` row carries a target %. Current weights
must be computed from live holdings.

**Decision**: A pure `AllocationDriftCalculator` takes (a) the portfolio summary
positions (each already carrying `valueUsd` from `GetPortfolioSummary`, reused by
`GenerateWeeklyAnalysis` today) and (b) the targets document. For each position it
resolves membership in priority order — explicit `symbols` match → else
`assetTypes` (+ optional `brokers`) match → else an `unclassified` bucket — sums
current USD per class and per bucket, divides by grand total for current %, and
computes `drift = currentPct − targetPct`. Over/under-weight is the **sign** of
drift (Q3 clarification; no tolerance band). Returns `driftByBucket[]` and
`driftByAssetClass[]`.

**Rationale**: Pure function → unit-testable (Principle IV); reuses existing
`valueUsd`; membership rules live in the targets doc, not in code, so framework
changes don't require code edits.

**Edge handling**: positions matching no rule land in an `unclassified` row so
totals always reconcile to 100%; this is visible, not silently dropped.

---

## R3 — Concentration-cap computation

**Decision**: The same calculator evaluates each cap entry from the targets doc.
A cap declares a `scope` (`portfolio` or `bucket`), the dimension it limits
(`symbol`, `assetType`, or `bucket`/`class` label), and `softPct` / `hardPct`.
The calculator measures the current level for that dimension over the scope
denominator and emits a `concentrationCaps[]` row with `{ label, scope, softPct,
hardPct, currentPct, breach: 'none'|'soft'|'hard' }`. `breach` is the highest
limit exceeded. Entity-agnostic per the Q4 clarification — whatever caps the doc
defines are rendered, each with its label.

**Rationale**: Keeps cap semantics in data, not code; one row shape covers
single-name, issuer, bucket, and class caps.

---

## R4 — LLM-emitted sections via the tool schema

**Context**: Watchlist, week-over-week analytical deltas, and framework
amendments are judgment, not arithmetic, so they stay LLM-produced. Today
`submit_analysis` emits only `{summary, markdownBody, orders[]}`.

**Decision**: Extend the `submit_analysis` `input_schema` with three **optional**
arrays — `watchlist[]`, `weekOverWeek[]`, `frameworkAmendments[]` — each with
typed, length-bounded fields and descriptive field docs guiding the model.
Optional (not in `required`) so the model omits a section when there is nothing
to report (→ FR-008 "absent = omitted"), avoiding fabrication. The deterministic
drift/cap arrays are **not** added to the tool schema (computed in code).

**Rationale**: The JSON schema is the output harness — wrong shape/enum fails the
run cleanly via the existing `LLMSchemaValidationError` path
(`GenerateWeeklyAnalysis.js:237`) rather than corrupting storage. Optional fields
keep the model honest.

---

## R5 — Guardrail preamble: storage + assembly + exposure (FR-014..FR-017)

**Context**: Feature 005 made the edited instructions document the *entire*
system prompt, used verbatim (`GenerateWeeklyAnalysis.js:206`). The new preamble
must be non-editable yet visible.

**Decision**:
- Store the preamble as a committed text module
  `src/application/use-cases/analysis/prompts/guardrail-preamble-v1.md` (generic,
  holdings-free, committable).
- At assembly, prepend it: `systemPrompt = preamble + "\n\n---\n\n" + instructionsContent`
  (replacing the bare `systemPrompt = instructionsContent`). Bump `promptVersion`
  marker to record that a preamble was applied.
- Expose it read-only: `GET /api/instructions` response gains `preamble` (string)
  and `editingGuide` (string), both read from committed files. No new endpoint.
- The editor (`instructions.astro`) renders the preamble in a read-only block
  above the editable textarea and shows the editing guide in a collapsible panel.
  The textarea still binds only to the editable body; `PUT /api/instructions`
  is unchanged (body only).

**Rationale**: Non-editability is structural — the preamble lives in a committed
file, not in the editable settings row, so no save path can touch it. Transparent
(owner sees the full effective prompt). Privacy-clean.

**Alternatives considered**:
- *Preamble in a settings row* — would be editable/removable; rejected (defeats
  the story).
- *Preamble baked into the editable body* — same problem; rejected.

---

## R6 — Narrative de-duplication (FR-009)

**Decision**: Two complementary mechanisms:
1. Update the committed base prompt template `weekly-rebalance-v1.md` Output-format
   section to **drop** the now-tabular sections (bucket/class weights & drift,
   concentration call-outs) from the required markdown, keeping only prose
   interpretation/reasoning.
2. The guardrail preamble (R5) instructs the model not to restate or recompute the
   code-supplied tables.

The owner's *active* instructions body may have diverged from the base template
(feature 005 merged it in). The quickstart documents a one-time body trim / re-seed;
the preamble makes the de-dup robust even if the body lags.

**Rationale**: Belt-and-suspenders — template + preamble — so SC-003 holds without
fragile post-hoc markdown stripping (the rejected option from the conversation).

---

## R7 — Persistence (reuse feature-006 pattern)

**Decision**: Add six optional JSON columns to the `portfolioAnalysis` entity
mappers in `AzureAnalysisRepository`: `driftByBucketJson`, `driftByAssetClassJson`,
`concentrationCapsJson`, `watchlistJson`, `weekOverWeekJson`,
`frameworkAmendmentsJson`. Write only when present; parse on read with the
existing `_parseJsonColumn` helper (absent/malformed → null, logged). Add matching
optional fields + light "present-but-malformed is rejected, absent is fine"
validation to `WeeklyAnalysis`, mirroring `macroContext`/`positionChanges`
(`WeeklyAnalysis.js:77-157`). Whole-record replace semantics already satisfy FR-013.

**Rationale**: Identical to the shipped feature-006 approach; pre-feature rows stay
clean and render correctly (FR-003, SC-004).

---

## R8 — Rendering (reuse feature-006/008 pattern)

**Decision**: Add one `<section>` + one render function per structured section to
`analysis-detail.astro`, each `show()`n only when its data is present and non-empty
(mirroring `renderChanges`/`renderTotals`). Drift rows flag over/under by sign
(color), caps flag soft/hard breaches (badge). The week-over-week **analytical**
deltas section is visually labeled distinctly from the existing feature-006
position-changes table (FR-012). No new frontend dependencies.

**Rationale**: Consistent with the existing hand-rolled, dependency-free dashboard
sections.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where do machine-readable targets come from? | New `analysis.allocationTargetsV1` settings row + seeder (R1) |
| How are holdings mapped to buckets/classes? | Membership rules in the targets doc, applied by the calculator (R2) |
| How are caps modeled? | Scoped cap entries in the targets doc (R3) |
| How are the LLM sections captured? | Optional arrays on the `submit_analysis` tool schema (R4) |
| How is the preamble non-editable yet visible? | Committed file, prepended at assembly, surfaced read-only (R5) |
| How is the narrative trimmed? | Base-template edit + preamble instruction (R6) |
| Persistence & render? | Feature-006 JSON-column + hand-rolled section patterns (R7, R8) |

No `NEEDS CLARIFICATION` markers remain.
