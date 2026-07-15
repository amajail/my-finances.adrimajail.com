# Quickstart: Verifying Mobile Responsiveness

## Run the app locally

The dashboard and API are already expected to be running in local dev:

- API (Azure Functions): `http://localhost:7071/api` (`func start`)
- Dashboard (Astro dev): `http://localhost:4321`

> **Origin note:** load the dashboard from **`http://localhost:4321`**, not
> `http://127.0.0.1:4321`. The Functions host accepts the `localhost` origin; the
> `127.0.0.1` origin is CORS-rejected, so data won't load (unrelated to this feature).

## Verify responsiveness (Playwright MCP or DevTools)

For each of the nine pages (`/`, `/brokers`, `/positions`, `/analysis`,
`/analysis-detail?date=<latest>`, `/scorecard`, `/charts`, `/performance`,
`/instructions`, `/settings`):

1. Set the viewport to **360×780** (and repeat at **320×740**).
2. Assert **no horizontal document overflow**:
   ```js
   () => {
     const el = document.documentElement;
     return { overflow: el.scrollWidth - el.clientWidth }; // expect 0
   }
   ```
3. Open the page and confirm the **hamburger menu** appears, toggles open/closed,
   indicates the active page, and every destination is reachable.
4. On the table pages, confirm wide tables either **stack into label/value cards**
   (scorecard, analysis, analysis-detail) or **scroll within their own container**
   (positions, brokers) — the page itself never scrolls sideways.
5. Measure a mobile nav link's height — expect **≥44px**.

## Verify no desktop regression

6. Set the viewport to a desktop width (e.g. **1280×800**). Confirm the full
   horizontal nav is shown (no hamburger), tables render columnar as before, and
   no page overflows horizontally.

## Acceptance snapshot

| Metric | Baseline (before) | Target (after) |
|--------|-------------------|----------------|
| Pages with horizontal overflow @360px | 9 / 9 | 0 / 9 |
| Nav-induced overflow @360px | 531px | 0px |
| Nav destinations reachable @360px | 0 (all off-screen) | 9 / 9 |
| Mobile nav tap-target height | 30px | ≥44px |
| Desktop regressions | — | 0 |
