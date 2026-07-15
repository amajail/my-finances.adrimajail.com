# Data Model: Mobile-Responsive Dashboard

**N/A — no data model.**

This feature is presentation-only. It introduces no entities, no storage schema,
and no changes to the existing `portfolioBrokers` / `portfolioPositions` /
`portfolioSettings` / `portfolioPrices` tables or to any domain entity/value
object. It also adds no API endpoints or contract changes (so `contracts/` is
intentionally empty).

The only "state" introduced is transient UI state — whether the mobile nav panel
is open — held in the DOM (`aria-expanded` + a `hidden` class), not persisted.
