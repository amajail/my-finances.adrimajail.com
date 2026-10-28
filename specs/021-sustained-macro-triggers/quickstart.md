# Quickstart: validating sustained triggers

Prerequisites: Node dependencies installed (`npm ci`). No Azure access is needed; every check below runs against in-memory fakes.

## 1. Day-count logic (unit)

```bash
npx jest tests/unit/domain/services/SustainedTriggerEvaluator.test.js
```

Expect green cases for: below the day threshold, exactly at it (`heldDays === requiredDays` is met), above it, a value exactly equal to the threshold (not satisfying), an unavailable week inside the span (streak continues, `includesUnknown`), a violating week (streak stops), the current reading violating (`heldDays` 0), an unusable current reading (`unknown`), a gross-basis BCRA reading (`not-evaluable`), duplicate dates, and no history (`insufficient-history`).

## 2. Use case wiring

```bash
npx jest tests/unit/application/use-cases/analysis/GenerateWeeklyAnalysis.sustainedTriggers.test.js
```

Expect: the `## sustainedTriggers` block directly follows `## macroContext` in the message sent to the LLM client fake; the computed rows are on the saved analysis; a repository that throws while listing history still yields a completed run with every trigger `insufficient-history`; a first run (empty repository) completes.

## 3. Persistence and read surface

```bash
npx jest tests/unit/infrastructure/repositories/AzureAnalysisRepository.sustainedTriggers.test.js tests/integration/functions/getWeeklyAnalysis.test.js tests/unit/functions/mcp.test.js
```

Expect: `sustainedTriggersJson` round-trips, an old row reads back as `null`, and both the HTTP response and the MCP tool body carry `sustainedTriggers`.

## 4. Whole suite and lint

```bash
npm test
npm run lint
```

## 5. Manual check (optional, after merge)

Call `get_weekly_analysis` for the newest date through the `my-finances` MCP tools and confirm `sustainedTriggers` has three rows, with `bcraReserves` reported `not-evaluable` while only gross reserves are available.
