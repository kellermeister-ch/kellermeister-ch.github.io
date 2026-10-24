# Design

## Context

`cellar-page.ts` runs two Lit `Task`s:
- `_bottlesTask` returns the filtered rows (`Map<productId, Bottle[]>`).
- `_bottleCountTask` returns the cellar total (`bottleCountInCellar`), which deliberately ignores the filter.

`loadBottles()` re-runs both on every filter toggle, search input, and `CELLAR_UPDATED_EVENT`. `ProductFilter.hasRestrictions()` already reports whether any filter is set. `isText` is only true for a non-empty search text, so a cleared search counts as no filter.

## Goals / Non-Goals

**Goals:**
- Build the matching count from the same data as the rows, so it cannot disagree with them.
- Keep the subline text in one pure function that is easy to test.

**Non-Goals:**
- No new service or repository methods, and no extra Pod/IndexedDB reads.
- No change to the header component (`kellermeister-header.ts`). It still just renders the `subtitle` slot.
- Other views (cellarwork-work, search) are out of scope.

## Decisions

**Matching count = sum of the group sizes in `_bottlesTask.value`.**
The rows already hold exactly the filtered bottles. Summing `bottleGroup.length` gives the number the spec asks for ("equals the sum of the listed row counts") at no extra cost.
Alternative considered: a new `bottleCountInCellar(cellar, filter)` service call. Rejected because it repeats the full bottle scan and could briefly disagree with the rows while the two tasks finish at different times.

**Show the fraction only when `filter.hasRestrictions()` is true.**
This uses the existing domain predicate, so the page needs no rules of its own about which filters count. A filter that happens to match every bottle still shows `764 von 764 Flaschen`, which tells the user a filter is active.

**Pure formatter `formatBottleCount(total, matching?)`** in `src/infrastructure/web/components/` (next to `sync-status-format.ts`):
- `matching === undefined` → `"764 Flaschen"` / `"1 Flasche"`
- otherwise → `"14 von 764 Flaschen"`; the unit word is chosen by `total === 1`

The page passes `matching` only when a filter is active. The current inline ternary moves into this helper so both forms share one noun rule.

**Render only when both values are available.**
The subline is rendered from `_bottleCountTask` as now. The matching count is read from `_bottlesTask.value`. Lit `Task` keeps its last value while it re-runs, so the subline doesn't flicker during a filter toggle. On the very first load the fraction shows once the rows task has completed.

## Risks / Trade-offs

- [Totals and matching counts can briefly come from different task runs, e.g. right after a disposal] → Both tasks re-run together in `loadBottles()` and finish within milliseconds. The final state is always consistent.
- [A longer subline, e.g. `1234 von 1234 Flaschen`, in the fixed 64 px header] → It is still much shorter than the cellar name line. The known long-name overflow issue is unchanged by this change.
- [e2e `subtitleCount` parses the leading number] → Update the parser to read both numbers and keep the existing assertions on the total.
