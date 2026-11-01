# Tasks

## 1. Diacritic-insensitive plain text search

- [x] 1.1 Add a private static `normalizeForSearch` to `ProductFilter` (NFD, strip `\p{M}`, lower-case, fold `œ æ ß ø đ ł`) and use it for the entered text and every searched field in the plain text branch of `filterProduct`. Verify with `npm test -- ProductFilter`: the existing tests still pass.
- [x] 1.2 Add `ProductFilter.test.ts` cases for each new spec scenario: `bereche` finds `Bérêche Brut Réserve`; `Bérêche` finds `Bereche Brut Reserve`; `rotie`/`gruner`/`osterreich` find region, grape variety and country; `coeur`/`strasse` find `Cœur de Cuvée`/`Weinstraße`. Also add a decomposed-input case (`e` + U+0301). Verify that the new tests pass.

## 2. Integration check

- [x] 2.1 Run the full unit test suite (`npm test`) and `npm run build`, and verify that both succeed.
- [x] 2.2 In the running app (agent-browser), search for `bereche` on the search page and verify that a product named with `Bérêche` is listed, if the local data has one. Otherwise, use any accented product name from the data.

## Workflow follow-up

- Archive the change with `/opsx:archive` once implemented.
