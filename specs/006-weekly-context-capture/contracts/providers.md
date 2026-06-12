# Contracts: Provider interfaces (internal)

**Feature**: 006-weekly-context-capture

New interfaces in `src/application/interfaces/` and implementations in
`src/infrastructure/providers/`. All follow the existing `IRiesgoPaisProvider` pattern:
constructor injects `{ fetcher, url/baseUrl, timeoutMs, clock }`; throws a typed
`*FetchError`; returns a small plain object. Resilience (catch → `available:false`) lives in the
orchestrator, NOT in individual providers.

---

## IMacroContextProvider (orchestrator)

```
getLatest({ priorImfReading }) ->
  Promise<{
    readings: {
      riesgoPais, fxGap, bcraReserves, argInflation, argInterestRate,
      usaInflation, usaInterestRate, sp500Drawdown, imfReviewStatus
    },                                  // each a MacroReading {value, asOf, available, basis?}
    usage: { inputTokens, outputTokens, costUsd }   // from the IMF classify call (0 if skipped)
  }>
```
- Fans out to all sources via `Promise.allSettled`; never throws.
- `priorImfReading` is the previous analysis's `imfReviewStatus` reading (for carry-forward).

## Per-source providers (each returns its own typed reading or throws `*FetchError`)

| Interface | Method | Returns | Endpoint |
|---|---|---|---|
| `IRiesgoPaisProvider` (exists) | `getLatest()` | `{ basisPoints, asOf }` | argentinadatos riesgo-pais/ultimo |
| `IFxGapProvider` | `getLatest()` | `{ gapPct, asOf }` | dolarapi /oficial + /bolsa |
| `IBcraMonetariasProvider` | `getVariable(idVariable)` | `{ value, asOf }` | BCRA v4.0 /Monetarias/{id} |
| `IInflationProvider` | `getLatest()` | `{ percent, asOf }` | argentinadatos inflación |
| `IFredProvider` | `getLatestObservation(seriesId, {units})` | `{ value, asOf }` | FRED observations |
| `ISp500DrawdownProvider` | `getLatest()` | `{ drawdownPct, asOf }` | Stooq ^spx CSV |
| `IImfStatusProvider` | `getLatest({ priorReading })` | `{ status, asOf, usage }` | IMF RSS + AI classify |

Notes:
- `IBcraMonetariasProvider` serves both `bcraReserves` (id 1, attach `basis:"gross"` in
  orchestrator) and `argInterestRate` (id 160).
- `IFredProvider` serves `usaInflation` (CPIAUCSL, units=pc1) and `usaInterestRate` (DFEDTARU);
  requires `analysis.fredApiKey`. If key missing → provider throws `FredConfigError` → orchestrator
  maps both FRED indicators to `available:false`.
- `IImfStatusProvider` depends on `ILLMClient.classify(...)`; applies the 8-week carry-forward
  cap using `priorReading`. Returns `usage` so the use-case can add it to run telemetry and the
  cost cap.

---

## ILLMClient.classify (new method on existing client)

```
classify({ systemPrompt, userMessage, toolSchema, model, maxOutputTokens }) ->
  Promise<{ result: <tool input object>, usage: { inputTokens, outputTokens, costUsd } }>
```
- Mirrors `submitAnalysis`: forces `tool_choice` to the single tool, validates input against
  `toolSchema`, routes SDK errors through `LLMLogSanitizer`, computes cost from MODEL_RATES.
- For IMF: `toolSchema` = `contracts/imf-classify-tool.json`, `model` = `analysis.imfModel`
  (default Haiku). Input carries only public news text.
