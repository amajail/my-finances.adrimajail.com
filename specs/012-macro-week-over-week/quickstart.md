# Quickstart — Macro Week-over-Week Comparison (feature 012)

Goal: confirm the macro comparison appears on an analysis that has a prior week,
is absent on the first run, and matches the captured readings exactly.

## Prerequisites

- Azurite + functions running; `ANTHROPIC_API_KEY` set (a real run captures the
  macro panel).
- Allocation targets seeded (feature 010) so the run completes normally.

## 1. Need two consecutive analyses

The comparison needs a prior week. If you already have ≥2 weekly analyses, the
latest one will show the comparison. Otherwise produce two (different target
dates) so the second has a prior macro panel to diff against.

```bash
# trigger a run (real paid call); repeat on a later week if you only have one
curl -X POST http://localhost:7071/admin/functions/weeklyAnalysisTimer -H 'Content-Type: application/json' -d '{}'
```

## 2. Verify the comparison on the detail page + API

```bash
curl -s "http://localhost:7071/api/analysis/weekly/<latest-date>" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log('macroChanges:', Array.isArray(a.macroChanges)?a.macroChanges.length+' rows':a.macroChanges); (a.macroChanges||[]).forEach(r=>console.log(' ',r.label, r.priorValue,'->',r.currentValue,'(Δ',r.deltaAbs, r.deltaPct==null?'':r.deltaPct+'%)'));})"
```

Open `analysis-detail?date=<latest-date>` and confirm:

- A **"Macro — week over week"** table shows, with one row per numeric indicator
  that both weeks captured — including **BCRA reserves** — each with prior, current,
  Δ, and %.
- It is visually distinct from **"Changes this week"** (positions) and
  **"Week-over-week (analytical)"** (the narrative-driven table).
- `deltaAbs` equals `currentValue − priorValue` for every row (exactness).

## 3. Degradation checks

- Open the **earliest** analysis (no prior week): the macro comparison is absent —
  no empty table, no error.
- Open a **pre-feature** analysis: comparison absent; the rest of the page renders.
- An indicator that was unavailable in one of the two weeks does not appear as a
  row (no zero, no error).

## 4. Tests

```bash
npm test    # MacroChangeCalculator (diff math, skip rules, prior=0, null-on-no-prior),
            # WeeklyAnalysis macroChanges validation, repo round-trip.
```
