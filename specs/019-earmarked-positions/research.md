# Research: Earmarked positions in the weekly analysis payload

All Technical Context items were resolved during specify; no open
NEEDS CLARIFICATION remained (the spec quality checklist passed on the first pass — see
`checklists/requirements.md`). This file records the key design decisions and the
existing-code grounding they rest on.

## Decision 1 — Classification rule: broker membership AND `valueUsd > 0`, evaluated before the feature-013 administrative check

- **Decision**: A position is earmarked iff its `broker` is in the configured earmarked-broker
  list AND its computed USD value is > 0. This check runs *before* the existing feature-013
  administrative check (`valueUsd <= 0`), so an earmarked broker's position is never
  miscategorized as an administrative/legacy stub — it is classified as earmarked first, and
  only falls through to "administrative" if its value is ≤ 0 (spec FR-006, Edge Cases).
- **Rationale**: Today, an earmarked reserve held as cash with no live price feed computes to
  `valueUsd: 0` and lands in `administrativePositions` purely as an artifact of price
  unavailability — not a deliberate classification. Partition order (earmarked check first)
  fixes the misclassification without touching how `administrativePositions` itself is
  computed for every other zero/negative-value holding (spec Assumption: this feature only
  changes *which bucket* a positive-value position at an earmarked broker falls into).
- **Code grounding**: the existing administrative partition
  (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:182-183`) filters the full
  snapshot into `investableSnapshot` (`valueUsd > 0`) and `administrativePositions`
  (`valueUsd <= 0`) in one pass. The earmark partition is inserted as a prior pass over the
  same source snapshot, producing `earmarkedPositions`; the existing pass then runs over
  `snapshot minus earmarkedPositions` unchanged.
- **Alternatives rejected**: (a) checking administrative status first, earmark second — would
  let a price outage silently reclassify a real reserve as a worthless stub, the exact bug
  this feature fixes; (b) per-position tag/flag instead of broker-level config — over-engineered
  for a single dedicated reserve broker/account (spec Assumption on broker-level granularity).

## Decision 2 — Configuration: a settings key, not a hardcoded constant

- **Decision**: Read a new `analysis.earmarkedBrokers` settings row (comma-separated broker
  ids) via the existing `_getSetting` helper, defaulting to `'cash'` when unset.
- **Rationale**: Spec FR-001/SC-004 require the designation to be changeable — or clearable —
  without a code deploy (e.g. once the reserve's real-world purpose is fulfilled and the money
  re-enters the investable pool). The settings table already exists and is read the same way
  every other tunable (`analysis.model`, `analysis.maxInputTokens`, etc.) is read.
- **Code grounding**: `_getSetting(key, defaultValue)`
  (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:703-711`) already implements
  "read setting, fall back to default on missing/error" — reused verbatim, just with a new key
  and a string default instead of a numeric one. Parsing the comma-separated list into a broker
  id array is a one-line `split(',').map(s => s.trim()).filter(Boolean)`.
- **Alternatives rejected**: a hardcoded `EARMARKED_BROKERS = ['cash']` constant — fails
  FR-001/SC-004 outright (would require a deploy to change or clear).

## Decision 3 — Where exclusion happens: partition upstream, keep every calculator pure

- **Decision**: Partition the snapshot in `GenerateWeeklyAnalysis` into (in order) earmarked →
  administrative → investable; pass only the investable set to
  `AllocationDriftCalculator.computeDrift`, `.computeConcentrationCaps`,
  `DuplicateHoldingsDetector.detect`, and `PositionChangeCalculator.diff` — on **both** sides of
  the position-change diff (current investable snapshot and the prior week's investable
  snapshot, filtered the same way).
- **Rationale**: Identical to the feature-013 precedent (Constitution II — domain services stay
  pure functions over whatever set they're handed). Because an earmarked position never enters
  any of these four inputs, it cannot appear as a drift contributor, a cap numerator/denominator
  entry, a duplicate-holdings match, or a week-over-week added/removed/increased/reduced row —
  satisfying spec FR-002/FR-005/SC-001/SC-003 by construction, with zero changes to any of the
  four calculators' internal logic.
- **Code grounding**: `investableSnapshot` build and its three consumers
  (`GenerateWeeklyAnalysis.js:182-187` for the snapshot/duplications, `:193-205` for
  drift/caps, `:217-220` for the position-change diff — including the prior-snapshot filter at
  `:217-219` that must apply the same earmark exclusion to `previousAnalysis.portfolioSnapshot`).
- **Alternatives rejected**: filtering earmarked positions inside the calculators themselves —
  would duplicate the same broker-membership check across four unrelated pure functions and
  couple them to a concept (earmarking) they have no reason to know about.

## Decision 4 — Persistence + entity: mirror the feature-013 optional-section pattern exactly

- **Decision**: Add an optional `earmarkedPositions` array to `WeeklyAnalysis` — same shape,
  validation, freeze, getter, and `toJSON` treatment as `administrativePositions` — persisted as
  an `earmarkedPositionsJson` column written only when non-empty, read back with the existing
  JSON-column parser, and included on the `_persistFailed` path (spec FR-007).
- **Rationale**: Identical backward-compatibility profile to every other optional-array field on
  `WeeklyAnalysis`: pre-feature rows simply lack the column → field reads back as `[]` (or `null`
  for the failed-run capture buffer, mirroring how `administrativePositions` is threaded through
  `_persistFailed`) → no section is produced, no error, no crash (spec Edge Cases).
- **Code grounding**: `WeeklyAnalysis` constructor/validate/freeze/getter/toJSON for
  `administrativePositions` (`src/domain/entities/WeeklyAnalysis.js:104-107,126,205,254`, plus the
  "each entry must be an object" validation loop that already includes it at line ~205);
  `AzureAnalysisRepository` write-when-non-empty
  (`src/infrastructure/repositories/AzureAnalysisRepository.js:292-298`) and
  read-with-default-`[]` (`:337-338,374-377`).
- **Alternatives rejected**: none seriously considered — this is a direct structural mirror of
  an already-shipped, already-tested pattern in the same file; inventing a different persistence
  shape would add risk for no benefit.

## Decision 5 — Generation input: a compact labeled block, generic wording only

- **Decision**: In `_buildUserMessage`, build `## currentHoldings` from the investable set only
  (earmarked positions excluded, same as administrative positions already are); add a new
  `## earmarkedPositions` block (JSON array + a combined `totalUsd`) with fixed, generic
  instruction text — exclude from "invested capital" reasoning, report as a separate line, never
  suggest deploying/trimming/selling — and omit the block entirely when there are none.
- **Rationale**: Spec FR-003/FR-004/FR-008/SC-002/SC-005 require the reserve to be visible to the
  model as its own line, excluded from investable-capital reasoning, and never a source of funds
  — while spec FR-009 requires the *fixed* code never hardcode a specific real-world purpose (a
  named purchase, a specific goal). The purpose/framing is the owner's editable
  instructions-document content (already synced separately as the v3.1 framework), not baked
  into `GenerateWeeklyAnalysis.js`. This mirrors how `administrativePositions` and `duplications`
  are already labeled generically in the prompt rather than referencing any specific holding.
- **Code grounding**: block assembly pattern for `administrativePositions`/`duplications`/
  `concentrationCaps` in `_buildUserMessage`
  (`src/application/use-cases/analysis/GenerateWeeklyAnalysis.js:573-614`), and the
  `currentHoldings` filter that already excludes administrative positions
  (`:527-529`) as the model for also excluding earmarked ones.
- **Alternatives rejected**: naming the real-world purpose in the fixed block text (e.g. "funds
  reserved for a property purchase") — directly violates FR-009 and would leak the owner's
  private planning context into committed, generic application code.
