# Tasks

## 1. Subline formatter

- [x] 1.1 Add `formatBottleCount(total, matching?)` in `src/infrastructure/web/components/bottle-count-format.ts`. It returns `N Flasche(n)` without `matching` and `M von N Flasche(n)` with it; the unit word follows `total`. Verify with `bottle-count-format.test.ts`, covering `764 Flaschen`, `1 Flasche`, `0 Flaschen`, `14 von 764 Flaschen`, `0 von 764 Flaschen`, `1 von 764 Flaschen` and `1 von 1 Flasche`. `npm test` passes.

## 2. Cellar page

- [x] 2.1 In `cellar-page.ts`, render the subline with `formatBottleCount`. Pass the sum of the group sizes in `_bottlesTask.value` as `matching` only when `this.filter.hasRestrictions()`. Update the comment on `_bottleCountTask`: it still returns the unfiltered total, now used as the denominator. Verify `npm run build` passes and that in `npm run dev` toggling `Rot` shows `x von y Flaschen` and toggling it off shows `y Flaschen`.
- [x] 2.2 Check the remaining interactions in the dev app: search text, combined filters, a filter with no matches (`0/y Flaschen`), opening a URL with `?rot=1`, and disposing a listed bottle to Altglass (both numbers drop by one). The subline must match the row badges each time.

## 3. e2e and spec upkeep

- [x] 3.1 In `e2e/specs/cellar-bottle-count.spec.ts`, make `subtitleCount` parse both the plain and the `x von y` form. Rewrite "count is unaffected by wine-type filters and search" to assert `<sum of row badges> von <luzernTotal> Flaschen` for each wine-type filter and for the search, and `<luzernTotal> Flaschen` after clearing. Assert run-time totals, not fixed seed counts. Verify `npm run test:e2e -- cellar-bottle-count` passes.
- [x] 3.2 Update the `## Purpose` of `openspec/specs/cellar-bottle-count-header/spec.md`. It currently says the count "stays put while the wine-type and search filters narrow the rows"; reword it for the `x von y` form. Verify with `openspec validate cellar-filtered-bottle-count --strict`.

## Workflow follow-up

- The URL-restore e2e test is `test.fixme`: a few seconds after a full page load the app can leave the cellar view for `/` on its own (likely the `restorePreviousSession` redirect in `InruptSolidService.restoreSession`). Re-enable it once that is fixed in a separate change.

- Archive with `openspec archive cellar-filtered-bottle-count --yes` once implemented and verified.
