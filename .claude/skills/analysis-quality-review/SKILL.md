---
name: "analysis-quality-review"
description: "After a weekly analysis lands, or when the owner wants to judge whether the app's recommendations were actually good and how to improve the prompt or functionality: review the latest week's orders, multi-week consistency, live outcomes via read-only broker quotes, then propose ranked improvements."
metadata:
  author: "my-finances"
user-invocable: true
disable-model-invocation: false
---

# analysis-quality-review

Judges what the weekly analysis actually recommended (symbols, `rationale`,
`conviction`) and turns that into concrete prompt or functionality changes. It
reads real holdings, so it writes only to `docs/private/` (gitignored). It is
read-only against the store and brokers, and human-in-the-loop: it proposes,
the owner decides, nothing is implemented here. `system-assessment`'s Prompt
Review step defers here for content-level judgment.

Follow these steps in order.

## Tool rules (non-negotiable)

All tools are deferred; load schemas per phase with `ToolSearch select:`, not all upfront:
- Steps 1-3: `select:mcp__my-finances__list_weekly_analyses,mcp__my-finances__get_weekly_analysis,mcp__my-finances__portfolio_summary,mcp__my-finances__list_positions,AskUserQuestion`
- Step 4: `select:mcp__claude_ai_Invertir_Online__get_asset_quote,mcp__claude_ai_Invertir_Online__get_price_history,mcp__claude_ai_Invertir_Online__get_portfolio,mcp__claude_ai_Interactive_Brokers_IBKR__get_price_snapshot,mcp__claude_ai_Interactive_Brokers_IBKR__get_price_history,mcp__claude_ai_Interactive_Brokers_IBKR__get_account_positions,mcp__claude_ai_Interactive_Brokers_IBKR__search_contracts`

- **Allowed, my-finances MCP:** `list_weekly_analyses`, `get_weekly_analysis`,
  `list_positions` (filter by broker/status; unfiltered it returns every row),
  `portfolio_summary`, `list_audit_entries`.
- **Allowed, IOL:** `get_asset_quote`, `get_price_history`, `get_portfolio`.
- **Allowed, IBKR:** `get_price_snapshot`, `get_price_history`,
  `get_account_positions`, plus `search_contracts` only to resolve a
  `contract_id` (the IBKR price tools require one).
- **NEVER call** anything that places, cancels, validates or creates orders,
  alerts, watchlists, screeners, FCI subscriptions/redemptions or cauciones
  (`place_order`, `cancel_order`, `create_order_instruction`, `subscribe_fci`,
  `redeem_fci`, `place_caucion`, ...), nor `update_position`, `create_position`,
  `set_order_execution_status`, `trigger_price_refresh`. Both connectors expose
  order tools; a typo here moves real money.
- **Brainstorm checkpoints** use `AskUserQuestion` (load via ToolSearch) with 2-4
  concrete options and a recommended default marked first. If it is
  unavailable, print a plain numbered list with the default and wait for a reply.

## Step 1 — Pull the latest completed week

1. `list_weekly_analyses` (limit ~8). Take the newest `status: completed` row.
2. `get_weekly_analysis` for that date. It returns `date`, `status`,
   `generatedAt`, `modelUsed`, `portfolioTotals` (incl. `mepRate`,
   `mepRateAsOf`), `macroContext`, `summary`, `markdownBody` and `orders[]`
   (`index`, `broker`, `symbol`, `side`, `quantity`, `rationale`, `conviction`,
   `executionStatus`, `executionPrice`; plus, once feature 020 is deployed,
   per-order `ageWeeks` and analysis-level `confirmationItems[]`, absent/0/`[]`
   on older rows). It does NOT return `portfolioSnapshot`,
   `promptVersion`/`instructionsHistoryRowKey`, `executionNote`,
   `positionChanges`, `watchlist` or `weekOverWeek`; do not claim to have seen them.
3. Fields of an order (`SuggestedOrder` in `src/domain/entities/SuggestedOrder.js`):
   `side` is `buy|sell` only (no hold); `conviction` is `low|medium|high`; there
   is no target/limit price and no invalidation condition. `ageWeeks` is 0 for a
   new order, N when already pending N prior weeks when issued. Each
   `confirmationItems` entry (orders pending 3 consecutive weeks or probably
   filled, not re-issued) has `ageWeeks`, `originDate`, `lastDate`, `lastIndex`,
   `reason`, `proposedStatus` (never `skipped`).
4. A failed or empty week (`orders: []`) is a finding, not an error: note it, move on.

## Step 2 — Review the week's decisions

Judge the **decision first, the outcome second**. A 1-4 week price move is mostly
noise. For each order and for the narrative, check:

- Does `rationale` match the evidence in `macroContext` and `markdownBody`?
  Does `conviction` fit the strength of that rationale?
- Is it consistent with the owner's strategy and guardrails (caps, earmarked
  funds, dust rule, macro triggers named in `markdownBody`)? Sizing sensible?
- Specific, or boilerplate re-issued unchanged (same text, same size)?
- What is NOT recommended: obvious drift or red flags the body mentions but no
  order addresses.

**Brainstorm checkpoint A** (before concluding anything): ask which orders look
wrong or deserve a deeper look. Options: "all fine, move on" (default), "dig
into specific order(s)" (list them by index), "focus on missing actions".
A and B may go in one `AskUserQuestion` call (up to 4 questions).

## Step 3 — Multi-week consistency

Fetch 4-8 recent weeks (`get_weekly_analysis` per date, all in one parallel
batch). Compare orders across weeks: buy then unexplained reversal, same order
re-issued while still `pending` (a stuck order the owner never recorded),
conviction drift with no new catalyst, rationale copied verbatim. Where present,
use `ageWeeks` and `confirmationItems` instead of comparing by hand; keep the
manual comparison for older weeks.

**Contradiction check:** compare each week's `markdownBody` statements about
position changes or executed orders (Week-over-week section) with that week's
`executionStatus` values. An order still `pending` while a later body says it
happened means the status is unrecorded, not skipped; report it as a finding
with the weeks involved.

**Re-run replacement caveat:** a re-run of a date silently replaces that date's
unmarked orders, so an old week's `orders` may reflect a later re-run. Flag a
week when `generatedAt` is far later than `date` (more than ~1 day), or its
orders contradict its own `markdownBody`. Say explicitly when no week shows this
signal. Note `executionStatus` is owner-reported (see `OrderExecutionMatcher` in
`src/domain/services/`); `pending` often means "not recorded", not "skipped".

## Step 4 — Live outcome check (read-only)

Pick at most ~5 symbols from recent orders (ask only if more than that). Issue
the per-symbol and benchmark history calls in one parallel batch. For an order
re-issued unchanged across weeks, measure from the chain's FIRST issue date, not
the latest week's, and state that start date in Section 3.

1. **Match broker AND instrument, not the bare ticker.** One ticker can be
   different instruments across brokers/currencies/asset classes. With IBKR,
   `search_contracts` (param `query`): a bare ticker returns ~100 mixed rows
   (futures, indices, bonds, funds), so query by company name or ticker plus
   name and pick the single `STK`/`ETF` row on the right exchange
   (NYSE/ARCA/NASDAQ), never a futures/index/fund row with the same ticker.
   With IOL pass `market` (`BCBA|NYSE|NASDAQ|AMEX`); US-listed NYSE Arca ETFs
   are `AMEX` (try it first, then NYSE/NASDAQ).
2. **Same-source % change only.** Take one connector `get_price_history`
   series: the last bar on or before the analysis `date` (weekend dates have no
   bar) versus the latest bar (or `get_asset_quote` / `get_price_snapshot`).
   IBKR history takes a `period`, not a from-date: choose one that covers the date.
   IOL history bars can carry noisy `volume`; use `close` only.
3. **Fixed income (`bond|bopreal|on|lecap`):** NEVER mix store prices with
   connector prices (CLAUDE.md rule 2: the store is per 100 nominales on the
   app's own scale, differing 100-1000x per instrument). Use only the
   connector's own start and end bars. Never write a price anywhere.
4. **Compare, don't report raw moves:** (a) a same-currency benchmark chosen
   with the owner (e.g. a broad US ETF for USD holdings), (b) "do nothing" (for a
   buy: cash; for a sell: holding), (c) ARS instruments in USD via MEP: use
   `portfolioTotals.mepRate` from that week's analysis and the current rate from
   `portfolio_summary`.
5. Hindsight guard: a sell that "missed a rally" or a buy that dipped is not
   proof of a bad call. Tie each outcome back to Step 2's decision judgment.
6. If a connector is unauthorized/unavailable, say so in the report, skip that
   broker's symbols, and ask the owner to paste quotes. Do not substitute store prices.

**Brainstorm checkpoint B:** confirm the benchmark and the symbol list. Options:
"broad US ETF held in the portfolio" (default), "owner names one", "skip
benchmark this run". Skip the question when 2 or fewer symbols recur: state the
default benchmark in the report and still log it in Section 5.

## Step 5 — Improvement candidates

Turn findings into numbered candidates, each tagged **prompt wording** or
**functionality**, with the evidence (week, order index) behind it.

- **Sample-size guard:** no prompt-change candidate on fewer than ~4 weeks of
  consistent evidence; below that, record under "Open Questions".
- **Label risk-increasing candidates** (loosens a guardrail, raises
  concentration or turnover) as **risk-increasing**. Goal is risk-adjusted
  results, and beware overfitting to recent luck.
- Do not re-derive known gaps: outcome P&L is `docs/roadmap-2026-07.md` P3-2 and
  `specs/007-suggestion-scorecard/` (`GetSuggestionScorecard` is execution-rate
  only and not MCP-exposed). Known gaps to cite: no target price or invalidation
  field, `portfolioSnapshot` prices and prompt version not exposed via MCP,
  `executionPrice` usually null. Stale/unrecorded order re-issue is handled by
  feature 020 (`specs/020-stale-order-handling/`): do not re-propose it; check
  instead that `confirmationItems` are being resolved.
- Where the change lives: the owner-edited instructions document (settings, see
  `src/application/use-cases/analysis/prompts/editing-guide-v1.md`) versus committed
  code/prompts (`weekly-rebalance-v1.md`, `guardrail-preamble-v2.md`, `guardrails.js`).
  Changes to committed files are code PRs, never settings tweaks.
- Prompt-version attribution is impossible today; ask when the instructions were
  last edited before crediting a change in outcomes.

**Brainstorm checkpoint C:** owner ranks candidates. Options: "implement top 1
via speckit" (default), "ad-hoc fix for #N", "park all as Open Questions".
This skill never implements.

**Handoff to speckit:** when the owner picks it, write the `/speckit-specify`
description structurally (placeholders SYMBOL/BROKER, counts of weeks, no real
symbols, quantities, prices or rationale text), state the owner's decisions, and
remind that the report itself stays in `docs/private/` only.

## Step 6 — Write the report

Write `docs/private/analysis-review-YYYY-MM-DD.md` (real symbols and figures are
allowed here and nowhere else; `docs/private/` is gitignored). Template:

```
# Analysis Quality Review — YYYY-MM-DD

## 1. This Week's Recommendations
## 2. Trend Across Weeks
## 3. Live Outcome Check
## 4. Prompt & Functionality Improvement Candidates
## 5. Decisions Made This Run
## 6. Open Questions / Deferred
```

Section 3 states per symbol: connector, instrument matched, start/end dates,
same-source % change, benchmark, do-nothing delta, and any gap (unavailable
quote, no history). Section 5 logs each checkpoint's question and the owner's answer.

## Step 7 — Close out

1. Run `git status --short`; the report must NOT appear (ignored). If it does,
   stop and fix `.gitignore`, never `git add -f`.
2. Show the owner the report path and the ranked candidates.
3. Confirm no write/order tool was called this session.

## Privacy reminder

Real holdings flow through this session. Never copy symbols, quantities, prices
or rationale text into any tracked file, commit message, PR body or spec; refer to
them structurally ("an ETF buy, 4 weeks pending") outside `docs/private/`.
