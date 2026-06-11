# Research — Editable Analysis Metaprompt

Phase 0. Resolves the design unknowns the spec deferred to planning. The spec is
clarified (no `[NEEDS CLARIFICATION]` markers); the open items below are
HOW-level choices, not WHAT-level ambiguities.

---

## R1. Storage: reuse 004's tables/keys in place, or stand up new storage?

**Decision**: Stand up **new storage** — a new `portfolioInstructionsHistory`
table and a new `portfolioSettings` row `analysis.instructionsV1` (active
document + metadata). Leave 004's `portfolioFrameworkHistory` table and
`analysis.strategicFrameworkV1` row **untouched** (orphaned, no longer read by
the analysis runtime).

**Rationale**:
- FR-020 requires fresh history seeded with exactly one version and explicitly
  forbids carrying over 004's framework-only history. A new table makes "fresh"
  the default state — no deletion, filtering, or generation-marker is needed.
- Constitution III (Idempotent / non-destructive data ops): reusing
  `portfolioFrameworkHistory` in place would mean either mixing old framework-only
  rows with new full-document rows (violates "not accessible from the new area")
  or destructively clearing them. New storage avoids both.
- Rollback safety: if 005 needs to be reverted, 004's data is intact.

**Alternatives considered**:
- *Reuse the same table, add a `schemaVersion`/generation tag and filter.* More
  code and a permanent filter on every read, for no benefit — the rows are tiny
  and the old ones are now meaningless.
- *Reuse the table, delete old rows on seed.* Destructive; violates III; loses
  the audit trail of what 004 actually did.

**Note on the active settings key**: a *new* key (`analysis.instructionsV1`)
rather than overloading `analysis.strategicFrameworkV1` keeps the seed's
byte-for-byte content (template ⊕ framework) cleanly separated from the
framework-only value 004 wrote, and lets the seed be re-derived if needed
without clobbering 004's value.

---

## R2. Seeding for byte-for-byte equivalence (FR-015, SC-004)

**Decision**: The initial instructions document is produced by rendering the
committed base template through the **exact transformation the old runtime
applied**, then writing the result as one history version + active row.

The pre-005 effective system prompt was (see
`GenerateWeeklyAnalysis._renderSystemPrompt`):

```js
template = readFile('prompts/weekly-rebalance-v1.md')          // committed, generic
seed     = template.replace(/\{\{strategicFramework\}\}/g, active.content.trim())
```

So the seed is precisely `weekly-rebalance-v1.md` with **only** the
`{{strategicFramework}}` token replaced by the **trimmed** active framework
content. Every other `{{...}}` token in the template (`{{generatedAt}}`,
`{{portfolioSummary}}`, `{{previousAnalysis}}`, `{{riesgoPais}}`) is **left as
literal text** — the old runtime never substituted those into the system prompt
(they are documentation describing inputs delivered separately in the user
message). Preserving them as-is is exactly what byte-for-byte equivalence
requires, and FR-003's "no substitution going forward" then leaves them as inert
descriptive text, identical to before.

**Privacy (Constitution I, NON-NEGOTIABLE)**: the rendered seed contains the
owner's real framework, so it MUST be generated **at migration time from live
runtime settings** and never committed. `scripts/seed-instructions-from-framework.js`
reads `analysis.strategicFrameworkV1` from the running settings store (or via the
authenticated API), reads the committed template from disk, performs the single
substitution, and writes one instructions version. No real values land in git.

**Rationale**: Reproducing the production code's own substitution guarantees
SC-004 (byte-for-byte) rather than hand-transcribing. Trimming matches the old
behavior exactly (the framework was `.trim()`-ed before substitution).

**Alternatives considered**:
- *Commit a pre-merged seed file.* Rejected — it would embed the owner's real
  framework in git (Constitution I violation).
- *Seed with the raw template (placeholder unreplaced).* Rejected — the AI would
  receive a literal `{{strategicFramework}}` line instead of the framework,
  changing behavior (violates SC-004).

**Fresh/unseeded environment** (no `analysis.strategicFrameworkV1` present): the
seed substitutes the placeholder with the generic example framework already
referenced in the runtime error message
(`scripts/seed-analysis-framework.example.md`), or leaves a clearly-marked
"configure your instructions" stub. This path is out of the owner's critical
migration but is handled so a clean deploy is not broken (relates to edge case
"Analysis runs with no instructions configured" → FR-014).

---

## R3. Fate of the committed template and `analysis.promptVersion` (FR-019)

**Decision**: Retire template-file selection at runtime.
- `GenerateWeeklyAnalysis` no longer reads `analysis.promptVersion` nor loads
  `prompts/${version}.md`; it reads the active instructions document from the
  instructions repository and uses it **verbatim** as the system prompt.
- The committed `prompts/weekly-rebalance-v1.md` is **retained in the repo as the
  seed source only** (generic, committable, privacy-safe). It is no longer part
  of the analysis runtime path.
- `analysis.promptVersion` becomes a dead setting; the migration leaves it in
  storage harmlessly (non-destructive) but nothing reads it. Analyses are traced
  solely by their instructions-version reference (R5).

**Rationale**: FR-019 mandates the editable document be the single source of the
AI's instructions and that traceability move from template-version identifiers to
the instructions-version reference. Keeping the file only as a seed source
preserves a clean clone-and-deploy story without re-introducing runtime template
selection.

---

## R4. Document size cap 60 KB → 256 KB (FR-006)

**Decision**: `InstructionsHistoryEntry.MAX_BYTES = 262144` (256 × 1024), enforced
by UTF-8 byte length (`Buffer.byteLength(content, 'utf8')`) in the domain
constructor and re-checked in `SaveInstructions`. The API echoes `maxBytes`; the
dashboard mirrors it in the byte counter and validation message.

**Rationale**: The merged document (fixed instructions + framework) is materially
larger than the framework alone; the clarified cap is 256 KB. UTF-8 byte length
(not character count) matches 004's enforcement. Validation message states the
limit and the actual size, per FR-006.

**Storage correction — chunking required (implementation finding).** Azure Table
Storage caps a **single string property at 64 KB** (32K UTF-16 characters), *not*
the 1 MB per-entity limit. Feature 004's ≤60 KB framework fit in one `value`/
`content` property; a 256 KB document does **not** and a single-property write
fails with `PropertyValueTooLarge`. The repository therefore **chunks** the
document across `content`, `content1`, … (and `value`, `value1`, … on the active
settings row) with a `…Chunks` count, splitting on 32000-char boundaries (JS
string length = UTF-16 code units, matching Azure's character limit; safely under
32768). Worst case (ASCII 256 KB) → 9 chunks ≈ 576 KB UTF-16, well under the 1 MB
/ 252-property per-entity limits. Reads reassemble; reads are bounded by the
current `…Chunks` count so a Merge-updated settings row never returns stale higher
chunks; rows without a count fall back to the plain property (back-compat). See
`AzureInstructionsRepository` `setChunked`/`getChunked` and its unit test.

---

## R5. Analysis → instructions-version traceability (FR-012, FR-013)

**Decision**: Add a **new** optional field `instructionsHistoryRowKey` to
`WeeklyAnalysis` (additive, schema-on-write; absent on old rows → `null`).
`GenerateWeeklyAnalysis` captures it from a single `getActive()` call at the start
of the run (snapshot-at-start), exactly as 004 captured `frameworkHistoryRowKey`.
The dashboard reads the new field and links to `/instructions#<rowKey>`.

Keep the legacy `frameworkHistoryRowKey` field for pre-005 analysis rows: when
present (and `instructionsHistoryRowKey` is absent) the UI shows it as a
pre-feature reference; new runs populate only `instructionsHistoryRowKey`.

**Rationale**: The new rowKeys point into a *different* table
(`portfolioInstructionsHistory`); overloading the old field would conflate two
tables' keys. A separate additive field keeps both readable and handles
pre-feature analyses gracefully (FR-013), with no data migration.

**Alternatives considered**:
- *Reuse `frameworkHistoryRowKey` for the new reference.* Rejected — ambiguous
  which table a stored rowKey belongs to; complicates the "navigate to version"
  link and graceful pre-feature handling.

---

## R6. Snapshot-at-start under concurrent save (edge case "Save mid-analysis")

**Decision**: Reuse 004's snapshot semantics unchanged. `GenerateWeeklyAnalysis`
reads the active instructions document **once** at the start of the run and uses
that captured content + rowKey for the entire run; a `SaveInstructions` that lands
mid-run writes a new active version but does not affect the in-flight analysis
(FR-012, edge case). No locking needed — single operator, append-only history,
and a single read at start.

**Rationale**: Identical concurrency profile to 004; the proven model carries over.

---

## R7. Refactor-and-rename vs. add-alongside (SC-006)

**Decision**: Refactor/rename 004's "Framework" surface into "Instructions" and
**remove** the old framework HTTP routes, page, and nav entry — do not keep both.
SC-006 requires exactly one place to edit AI instructions and that the separate
"Framework" editor no longer exist as a distinct concept.

Concretely: new files `InstructionsHistoryEntry.js`, `IInstructionsRepository.js`,
`use-cases/instructions/*`, `AzureInstructionsRepository.js`,
`functions/instructions.js`, `dashboard/.../instructions.astro` (close copies of
the 004 equivalents with renamed identifiers, new table/key, new 256 KB cap), and
deletion of the corresponding framework files. 004's domain/use-case/repo/function
code for framework is removed once the analysis runtime is switched over.

**Rationale**: Leaving the framework editor live would violate SC-006 and confuse
the owner with two editors. The storage tables are still left in place (R1) —
"remove the code path, keep the old data" is the non-destructive middle ground.

**Open implementation choice (non-blocking)**: whether to `git mv` + edit each
004 file or author fresh files and delete the old ones. Either is acceptable;
`git mv` preserves blame. Decided at implement time.
