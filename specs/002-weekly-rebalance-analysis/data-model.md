# Phase 1 — Data Model

Two new domain entities (`WeeklyAnalysis`, `SuggestedOrder`) backed by two new Azure Tables (`portfolioAnalysis`, `portfolioOrders`). No state machine — all entities are immutable once written.

---

## Entities

### `WeeklyAnalysis` (domain entity at `src/domain/entities/WeeklyAnalysis.js`)

One record per weekly run, keyed by the target Friday's date.

| Field | Type | Required | Notes / Validation |
|---|---|---|---|
| `date` | string (ISO `YYYY-MM-DD`) | yes | The target Friday. Identity. |
| `status` | enum `"completed" \| "failed"` | yes | `failed` → `errorMessage` populated. |
| `generatedAt` | string (ISO timestamp) | yes | When the run started. |
| `modelUsed` | string | yes | E.g. `"claude-opus-4-7"`. Echoed from the SDK response. |
| `promptVersion` | string | yes | E.g. `"weekly-rebalance-v1"`. Matches a file in `src/application/use-cases/analysis/prompts/`. |
| `summary` | string | conditional | One-paragraph executive summary; required when `status === "completed"`. |
| `markdownBody` | string | conditional | Full narrative body in markdown; required when `status === "completed"`. |
| `riesgoPaisBp` | number (integer) | conditional | Argentina country risk in basis points at run time; required when the riesgo-país fetch succeeded. |
| `riesgoPaisAsOf` | string (ISO `YYYY-MM-DD`) | conditional | The date the riesgo-país reading is as-of. |
| `portfolioSnapshot` | array of `PortfolioSnapshotPosition` (JSON) | conditional | Per-position snapshot captured at run time. Required when the run made it past the portfolio-read step (see FR-019a). May be empty array if the failure occurred before portfolio assembly. |
| `tokensIn` | number | yes | Input tokens consumed (incl. cached). |
| `tokensOut` | number | yes | Output tokens consumed. |
| `costUsd` | number | yes | Estimated USD cost computed from `tokensIn` + `tokensOut` × model rates. |
| `durationMs` | number | yes | End-to-end run duration in ms. |
| `errorMessage` | string | conditional | Short human-readable failure reason; required when `status === "failed"`. |

**Identity invariants**:
- `date` MUST be unique across all `WeeklyAnalysis` records.
- `date` MUST be a Friday in the timezone `America/New_York` (validated at construction; warning-only since portal Test/Run can in theory invoke on other weekdays).

**Validation rules** (enforced in the entity constructor):
- `status` must be one of the enum values; `errorMessage` MUST be set iff `status === "failed"`.
- `tokensIn`, `tokensOut`, `costUsd`, `durationMs` are non-negative numbers.
- `riesgoPaisBp` (if present) is a non-negative integer.
- `markdownBody` (if present) is at least 200 characters (a sanity check — anything shorter is suspicious LLM output).

**Mutability**: Immutable. A re-run for the same `date` REPLACES the row wholesale (not merges); the prior content is overwritten as a single atomic write.

---

### `SuggestedOrder` (domain entity at `src/domain/entities/SuggestedOrder.js`)

One record per individual buy/sell suggestion produced by an analysis run, owned by the parent `WeeklyAnalysis`.

| Field | Type | Required | Notes / Validation |
|---|---|---|---|
| `analysisDate` | string (ISO `YYYY-MM-DD`) | yes | Foreign key to parent `WeeklyAnalysis.date`. |
| `index` | number (integer) | yes | Position of this order within the parent analysis's orders array (0-indexed). Combined with `analysisDate` forms the row identity. |
| `broker` | enum (broker ID) | yes | One of: `galicia`, `iol`, `ibkr`, `bullmarket`, `cash`. |
| `symbol` | string | yes | E.g. `BRK.B`, `GD41D`, `SGOV`. Free string (uppercase by convention) — the LLM is responsible for matching real holdings. |
| `side` | enum `"buy" \| "sell"` | yes | No `hold` — per Clarification Q5, hold-style commentary lives in narrative. |
| `quantity` | number | yes | Positive number. Units depend on the instrument (shares, nominales, etc.); the LLM emits in the unit the rationale describes. |
| `rationale` | string | yes | Free-text justification. Must cite at least one of: drift, directive, trigger, market context (FR-009). Minimum length 20 chars. |
| `conviction` | enum `"low" \| "medium" \| "high"` | yes | LLM's self-rated confidence. |

**Identity**: `(analysisDate, index)`. Order rows are addressed by their position in the parent's emitted list, not by content. Because the parent analysis is replaced atomically on re-run, this is sufficient and avoids the dedup question entirely (Clarification Q1 → no merge semantics).

**Validation rules**:
- `broker` must match an existing record in `portfolioBrokers` (validated at write time by the repository).
- `quantity > 0`.
- `rationale.length >= 20`.
- `side ∈ { "buy", "sell" }` only — `hold` is rejected with a validation error (defense against the LLM emitting it despite the prompt).

**Mutability**: Immutable. Re-run for the same `analysisDate` deletes the prior order rows for that date and writes the new set.

---

### `PortfolioSnapshotPosition` (value object, embedded in `WeeklyAnalysis.portfolioSnapshot`)

Captured per-position at run time. Not its own table — serialized inline as JSON on the parent analysis row.

| Field | Type | Required | Notes |
|---|---|---|---|
| `broker` | string | yes | Broker ID. |
| `assetType` | string | yes | One of: `stock`, `etf`, `bond`, `cedear`, `cash`, `deposit`, `bopreal`, `lecap`, `on`. |
| `symbol` | string | yes | Symbol identifier. |
| `quantity` | number | yes | Quantity at the time of the snapshot. |
| `averageCost` | number | yes | User's cost basis per unit (PPC). |
| `currentPrice` | number | nullable | Current price as of the snapshot. May be null for non-quotable positions (cash, deposits). |
| `currency` | string | yes | E.g. `USD`, `ARS`. |
| `valueUsd` | number | yes | Computed USD value at snapshot time (using MEP for ARS). Saved so the LLM doesn't have to re-derive. |

Closed positions are excluded from the snapshot.

---

## Azure Table schemas

### `portfolioAnalysis`

- **`partitionKey`**: `"weekly"` (single partition — there's only ~52 rows/year, no partitioning needed).
- **`rowKey`**: the `date` field as `YYYY-MM-DD`.
- **Columns** (Azure Tables flat schema):

  All `WeeklyAnalysis` fields above, with `portfolioSnapshot` stored as a JSON-stringified string field (Azure Tables doesn't support nested arrays natively). The repository serializes on write and deserializes on read.

### `portfolioOrders`

- **`partitionKey`**: the parent analysis's `date` (`YYYY-MM-DD`). Each weekly analysis's orders are colocated for cheap batch fetch.
- **`rowKey`**: zero-padded `index` (e.g. `"00"`, `"01"`, …). Lexicographic ordering matches numeric ordering for up to 100 orders per analysis.
- **Columns**: all `SuggestedOrder` fields above.

**Read patterns**:
- List page: `query("portfolioAnalysis", filter: PartitionKey eq 'weekly')`, sort by `rowKey` desc, take top N.
- Detail page: fetch one `portfolioAnalysis` row by `(PartitionKey='weekly', RowKey=date)` plus a `portfolioOrders` batch query by `PartitionKey=date`.

**Write patterns**:
- Successful run: one `upsertEntity` on `portfolioAnalysis` + N `upsertEntity` calls on `portfolioOrders` (or one transactional batch since they share `partitionKey`). Prior orders for the same partition are deleted first.
- Failed run: one `upsertEntity` on `portfolioAnalysis` with `status="failed"`; no rows in `portfolioOrders`.

---

## Relationships

```
WeeklyAnalysis (date) ─── 1───N ──── SuggestedOrder (analysisDate, index)
                                          (analysisDate = WeeklyAnalysis.date)
```

`WeeklyAnalysis` also embeds an array of `PortfolioSnapshotPosition` value objects (not a separate table — JSON column).

No relationship between `SuggestedOrder` and `portfolioPositions` — orders reference symbols by string; the use-case does not enforce that the symbol exists in `portfolioPositions`. (A `buy` order may target a symbol the owner doesn't currently hold; that's the entire point.)

---

## State transitions

None for either entity in normal operation. The two terminal states for `WeeklyAnalysis.status` (`completed`, `failed`) are set at write time and never change.

Edge case: a `portfolioAnalysis` row written as `"failed"` due to a transient issue may be re-run later (operator invokes the timer from Azure portal Test/Run). The re-run writes a NEW row with `status="completed"` that overwrites the failed one (same `rowKey`). This is not modeled as a state transition on a single entity — it's a replacement of one entity instance with another. The prior `failed` row is gone after the re-run.

---

## Open data-model questions

None. All schema decisions are locked here. Plan tasks will translate this into entity classes, repository methods, and JSON-schema validation at the LLM boundary.
