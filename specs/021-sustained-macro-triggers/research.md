# Research: Sustained Macro Triggers

## D1. Where the history comes from

- **Decision**: Read `macroContext` from the analyses already returned by `IAnalysisRepository.getLatest(n)`. No new repository method, no per-date `getByDate` calls.
- **Rationale**: `getLatest` maps every row through `_analysisFromEntity`, which already parses `macroContext`, so one list read carries the whole history. A 30-day trigger needs at most ~5 weekly rows; the loader asks for the longest window plus margin (see D5).
- **Alternatives**: `getByDate` per week as feature 020 does for orders (extra reads, and orders are not needed here). A dedicated history table (rejected by the spec: no new tables).

## D2. Observation dating

- **Decision**: One observation per calendar date, dated by the reading's own `asOf`, falling back to the analysis `date` when `asOf` is missing. If two analyses give the same date, the later analysis wins.
- **Rationale**: Sources lag (a reading can be days older than the run). Measuring from `asOf` keeps "days held" honest. Matches how `MacroChangeCalculator` already treats `asOf`.
- **Alternatives**: Run date only (overstates freshness when a source is stale).

## D3. Streak algorithm

Walk observations from the current reading backwards in time:

1. Current reading unusable → status `unknown`, nothing is FIRED.
2. Current reading violates the condition → `not-satisfied`, `heldDays = 0`.
3. Otherwise step back through prior observations, newest first:
   - satisfies → extends the streak, becomes the new streak start;
   - unusable (unavailable, missing indicator, non-numeric, failed or macro-less row) → **skipped, never a break**; if a later (older) satisfying observation is found, the skipped weeks are inside the span and `includesUnknown = true`;
   - violates → stop; the streak start stays at the last satisfying observation.
4. `heldDays` = days between the streak start's date and the current `asOf`. `durationMet = heldDays >= requiredDays`.
5. If the walk reaches the end of history while still satisfying, `historyLimited = true`: the count is a lower bound.
6. No prior usable observation at all → `insufficient-history`, `heldDays = 0`.

Unknown weeks at the old end contribute nothing, because the streak start is always a satisfying observation. This matches the spec assumption that unknown weeks bridge only when usable satisfying readings sit on both sides.

- **Alternatives**: Treating unknown as satisfying (inflates counts, can FIRE on no evidence). Treating unknown as a break (rejected by the spec).

## D4. Threshold semantics

- **Decision**: `>` and `<` are strict, matching the framework wording ("above 800 bp", "below 0"). A reading equal to the threshold does not satisfy.
- **Rationale**: The spec edge case says to follow the framework's wording. FR-015 calls for an exactly-at-threshold test; it is tested for both the value threshold and the duration threshold (`heldDays >= requiredDays`, so exactly 30 days is met).

## D5. History window

- **Decision**: Request `ceil(maxRequiredDays / 7) + 3` analyses (8 for the current 30-day set), filter to `status === 'completed'` and `date < targetDate`.
- **Rationale**: Covers a 30-day streak plus two unknown weeks. Failed runs have no reliable macro panel, so they are skipped as unknown rather than read.

## D6. BCRA reserves are gross, the trigger says net (finding)

- **Evidence**: `MacroContextProvider` builds `bcraReserves` with `basis: 'gross'` and the comment "No public NET-reserves source exists; this is GROSS". The framework trigger is "BCRA **net** reserves < 0". Gross reserves are essentially never negative, so evaluating it against the gross figure would report a permanent, misleading "not satisfied".
- **Decision**: Trigger definitions carry the `basis` they require. The evaluator reports `not-evaluable` (with the reason) when the reading's `basis` differs. The net-reserves trigger therefore reports `not-evaluable` until a net source exists. Wiring a net source is out of scope.
- **Alternatives**: Evaluate gross `< 0` (always false, looks reassuring and is wrong). Drop the trigger (hides the gap from the owner).

## D7. Where trigger definitions live

- **Decision**: A constant list in the domain service: `riesgoPais > 800 bp / 30d`, `fxGap > 50 % / 30d`, `bcraReserves < 0 (net) / 30d`.
- **Rationale**: These are macro thresholds, not holdings, prices or cost basis, so Principle I is not engaged. The owner's framework document lives in settings, not git, so a threshold edited there will not change the code. That drift risk is accepted for three fixed triggers and is recorded here.
- **Alternatives**: A settings row holding the definitions (more moving parts, a new validation surface). Parsing the framework text (fragile). Both are candidates for a later feature if the trigger set grows.

## D8. Prompt delivery and model-agnosticism

- **Decision**: A new `## sustainedTriggers` block placed immediately after `## macroContext` in the user message. Each row repeats the indicator key and its current value so the held-days figure sits beside the reading. The block is plain text plus compact JSON, like the other blocks, and does not touch the `ILLMClient` interface or the tool schema.
- **Guardrail**: One new numbered rule in `guardrail-preamble-v2.md` (edited in place, as feature 020 did): report a sustained trigger FIRED only when its row says `durationMet: true`, never infer duration from the current reading, and state when the span includes unverified weeks or is a lower bound.
- **Alternatives**: Adding fields inside `macroContext` (mixes raw readings with derived data and gets filtered by the unavailable-indicator pass). Changing the submit tool schema (not needed; FIRED is reported through the existing `frameworkAmendments`/narrative path).

## D9. Persistence

- **Decision**: Persist the computed rows as one more JSON column on the existing `portfolioAnalysis` row (`sustainedTriggersJson`), exposed as `sustainedTriggers` on the analysis entity and read surfaces. Absent on old rows, returned as `null`.
- **Rationale**: Satisfies FR-014 (auditable) and FR-012 (no new tables) by following the exact pattern of `macroChangesJson` and `confirmationItemsJson`. Payload is a few hundred bytes, well inside the table-property limit.

## D10. Failure behaviour

- **Decision**: If loading history throws, log a warning and compute with no history (every trigger `insufficient-history`). The run continues, as feature 020's order loader does. The computation itself is pure and total: malformed observations are treated as unusable.
