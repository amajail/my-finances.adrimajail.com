# Strategic Framework — owner-private content

> **This is a placeholder template.** Copy this file to
> `scripts/analysis-framework.local.md` (gitignored), replace the placeholders
> with your real framework, then run `node scripts/seed-analysis-framework.js`
> to persist it to the `portfolioSettings` row `analysis.strategicFrameworkV1`.
> The runtime use-case `GenerateWeeklyAnalysis` splices this content into the
> generic prompt template at the `{{strategicFramework}}` slot.

### Buckets and symbols

- **US** — IBKR-held US equities, ETFs, T-bills. Examples: SYM_A, SYM_B, SYM_C, SYM_D.
- **ARG** — Argentina-jurisdiction sovereign bonds, BOPREALs, CEDEARs, ARS LECAPs, ARS/USD cash. Examples: ARG_BOND_A, ARG_BOND_B, ARG_CEDEAR_A.
- **OffSystem** — physical USD cash reserve held outside any broker.

### Target allocation (quarterly cadence)

| Bucket / class | Target % |
|---|---|
| US — ETFs | 25% |
| US — Equities | 20% |
| US — T-bills | 10% |
| ARG — Sovereign bonds | 15% |
| ARG — CEDEARs | 5% |
| ARG — LECAP / BONO_CER | 5% |
| ARG — USD cash | 5% |
| OffSystem — USD cash | 15% |
| **Total** | **100%** |

### Triggers and conditional deploy preferences

- **`riesgoPais.basisPoints > 600`** → strategic default for deploying free USD cash is a short-duration US instrument over adding duration in long Argentine sovereigns.
- **`riesgoPais.basisPoints ≤ 600`** → strategic default for ARG-bucket cash deployment is a preferred sovereign long.

### Deploy priorities (where free cash goes within a bucket)

- **US bucket**: SYM_A (cap 50%) → SYM_B (cap 40%) → SYM_C (cap 30%) → SYM_D (cap 15%).
- **ARG bucket**: ARG_BOND_A default; short LECAP if MEP gap > 30%.

### Standing position-level directives

| Symbol | Directive | Rationale (background) |
|---|---|---|
| SYM_A | ADD | underweight vs. framework target |
| SYM_X | TRIM ~50% | sector concentration |
| SYM_Y | TRIM ~30% | profit-taking after large appreciation |
| SYM_Z | HOLD | thesis under review |

### Position-specific conventions

- **MEP-liquid bonds**: BOND_A and BOND_B are used for MEP conversion. Do NOT suggest closing them to fund unrelated trades unless a directive explicitly calls for it.
- **Illiquid bonds**: ILLIQUID_BOND_A and similar thinly-traded names — flag for manual verification in the narrative; do NOT emit a buy or sell order on them as routine.
