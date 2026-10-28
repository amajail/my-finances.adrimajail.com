# Data Model: Sustained Macro Triggers

No new tables. One new JSON column on the existing `portfolioAnalysis` row.

## SustainedTriggerDefinition (code constant, not stored)

| Field | Type | Notes |
|---|---|---|
| `key` | string | Macro indicator key: `riesgoPais`, `fxGap`, `bcraReserves` |
| `label` | string | Display label, same as `MacroChangeCalculator` where one exists |
| `unit` | string | `bp`, `%`, `USD M` |
| `comparator` | `'>'` \| `'<'` | Strict |
| `threshold` | number | `800`, `50`, `0` |
| `requiredDays` | integer | `30` for all three |
| `requiredBasis` | string \| null | `'net'` for `bcraReserves`, otherwise `null` (any basis) |

## SustainedTriggerResult (computed per run, persisted)

| Field | Type | Notes |
|---|---|---|
| `key`, `label`, `unit`, `comparator`, `threshold`, `requiredDays` | | Copied from the definition so a stored row is self-describing |
| `currentValue` | number \| null | Current reading, `null` when unusable |
| `currentAsOf` | string \| null | ISO date |
| `status` | enum | `met`, `building`, `not-satisfied`, `unknown`, `insufficient-history`, `not-evaluable` |
| `heldDays` | integer | Days the condition has held, ending at `currentAsOf`; `0` unless the condition currently holds with usable history |
| `durationMet` | boolean | `heldDays >= requiredDays` and the current reading satisfies the condition. This is the only FIRED gate. |
| `daysRemaining` | integer \| null | `max(0, requiredDays - heldDays)` when `building`, else `null` |
| `streakStart` | string \| null | ISO date of the oldest satisfying observation in the streak |
| `includesUnknown` | boolean | The span bridges at least one unusable week |
| `historyLimited` | boolean | The walk ran off the end of history while still satisfying: `heldDays` is a lower bound |
| `observations` | integer | Count of usable prior observations considered |
| `note` | string \| null | Short reason for `unknown` / `not-evaluable` (for example `reading basis is gross; net required`) |

### Status rules

| Status | When | `durationMet` |
|---|---|---|
| `unknown` | Current reading missing, unavailable or non-numeric | false |
| `not-evaluable` | Reading present but its `basis` differs from `requiredBasis` | false |
| `not-satisfied` | Current reading violates the condition | false |
| `insufficient-history` | Condition holds now, no prior usable observation | false |
| `building` | Condition holds, history exists, `heldDays < requiredDays` | false |
| `met` | Condition holds and `heldDays >= requiredDays` | true |

## MacroObservation (internal, derived)

`{ date: 'YYYY-MM-DD', usable: boolean, value: number | null, basis: string | null }`, built from each prior completed analysis's `macroContext[key]`. At most one per date.

## Persistence

- `WeeklyAnalysis.sustainedTriggers`: array of `SustainedTriggerResult` or `null` (pre-feature rows, and the failed-run row when macro was never captured).
- Table column: `sustainedTriggersJson` on the `portfolioAnalysis` row, written only when the array is non-null, parsed with the repository's existing `_parseJsonColumn` helper.
- The failed-analysis path stores whatever was computed before the failure, like `macroChanges`.
