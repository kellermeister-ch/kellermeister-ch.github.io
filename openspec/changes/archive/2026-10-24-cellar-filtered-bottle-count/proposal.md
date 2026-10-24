# Proposal

## Why

When a wine-type or text filter is active, the cellar header still shows only the cellar total (e.g. `764 Flaschen`). The user can't see how many bottles match the filter without adding up the row badges. Showing the matching count next to the total (`14 von 764 Flaschen`) answers both questions at once: how many bottles match, and out of how many.

## What Changes

- While at least one filter is active in the cellar view (Sprudel, Rot, Weiss, Rosé, or a non-empty search text), the header subline reads `<matching> von <total> Flaschen`, e.g. `14 von 764 Flaschen`. `<matching>` is the number of bottles in the listed rows.
- With no filter active, the subline is unchanged: `<total> Flaschen` / `1 Flasche`.
- The unit word agrees with the total: `Flaschen` for any total other than one, `Flasche` for a total of exactly one (so `1 von 764 Flaschen`, `0 von 764 Flaschen`).
- The fraction updates as filters are toggled, as the search text changes, and when the cellar's contents change.
- **BREAKING** (spec-level): this replaces the current requirement that the header count ignores active filters.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `cellar-bottle-count-header`: the requirement "The count is the cellar total, independent of active filters" is replaced. While a filter is active, the subline shows the matching count alongside the total.

## Impact

- `src/infrastructure/web/pages/cellar-page.ts`: header subline rendering. The matching count comes from the already-loaded, filtered bottle groups.
- A small pure formatting helper for the subline text, with a Vitest unit test (same pattern as `sync-status-format.ts`).
- `e2e/specs/cellar-bottle-count.spec.ts`: the test "count is unaffected by wine-type filters and search" and the `subtitleCount` parser need updating for the `x von y` form.
- No domain, service, or data changes. `KellermeisterService.bottleCountInCellar` stays the source of the total.
