# Contract — API response additions (feature 010)

No new endpoints. Two existing read endpoints gain fields. All additions are
backward-compatible (additive, optional).

---

## `GET /api/analysis/weekly/{date}` — analysis detail

The response (built from `WeeklyAnalysis` + orders) gains six **optional** keys.
Each is `null`/absent on pre-feature analyses and on runs that did not produce it.

```jsonc
{
  // …existing fields (status, summary, markdownBody, macroContext,
  //   portfolioTotals, positionChanges, orders, …) unchanged…

  "driftByBucket": [
    { "key": "us", "label": "US", "targetPct": 55, "currentPct": 58.2, "driftPct": 3.2, "currentUsd": 12345.67 }
  ],
  "driftByAssetClass": [
    { "key": "us-etf", "label": "US — ETFs", "targetPct": 25, "currentPct": 22.1, "driftPct": -2.9, "currentUsd": 4680.00 }
  ],
  "concentrationCaps": [
    { "label": "SYM_A single-name", "scope": "bucket", "bucketKey": "us", "softPct": 40, "hardPct": 50, "currentPct": 47.5, "breach": "soft" }
  ],
  "watchlist": [
    { "item": "ILLIQUID_BOND_A", "trigger": "thinly-traded — manual verification rule", "severity": "warn" }
  ],
  "weekOverWeek": [
    { "metric": "ARG bucket weight", "prior": "28%", "current": "31%", "direction": "up" }
  ],
  "frameworkAmendments": [
    { "proposal": "Raise US-ETF target from 25% to 30%", "rationale": "structural under-weight three weeks running" }
  ]
}
```

**Consumer contract** (`analysis-detail.astro`): render each section only when
its value is a non-empty array. `null`, absent, `[]`, or malformed → omit the
section (no empty shell, no error) per FR-008.

---

## `GET /api/instructions` — active instructions document

Gains two read-only string fields so the editor can show the guardrails the
owner cannot edit:

```jsonc
{
  "content": "…owner-editable body (unchanged)…",
  "historyRowKey": "…",
  "updatedAt": "…",
  "maxBytes": 262144,

  "preamble": "…fixed guardrail preamble (read-only, generic)…",
  "editingGuide": "…short markdown guide on what is safe to edit…"
}
```

- `preamble` and `editingGuide` are loaded from committed files; they are NOT
  persisted in settings and NOT editable.
- `PUT /api/instructions` is **unchanged** — it still accepts only
  `{ content, changeNote? }` (the body). Attempting to send a preamble has no
  effect; the editor never offers it for edit (FR-016).
- The effective system prompt used by `GenerateWeeklyAnalysis` is
  `preamble + "\n\n---\n\n" + content` (FR-014).
