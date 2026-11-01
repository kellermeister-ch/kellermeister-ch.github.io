# Proposal

## Why

Many wine and producer names carry accents and other diacritics (Bérêche, Côte-Rôtie, Grüner Veltliner, Mâcon). The text filter only lower-cases the text before comparing it, so a search for `bereche` does not find `Bérêche`. Users have to type the exact accented spelling, which is awkward on a phone keyboard and easy to get wrong.

## What Changes

- The plain text search of the shared text filter ignores diacritics: before comparing, both the entered text and the searched product fields are folded to their base letters (`é` → `e`, `ê` → `e`, `ü` → `u`, `ç` → `c`, …).
- The comparison works in both directions: `bereche` finds `Bérêche`, and `bérêche` finds a product spelled `Bereche`.
- The ligatures that Unicode does not split into a base letter and a mark are folded too: `œ` → `oe`, `æ` → `ae`, `ß` → `ss`.
- The special queries (`bis <year>`, `ml <size>`, `top<N>`) are unchanged.
- The search pages, cellar, cellarwork and order pages all benefit, because they share the same filter.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `product-text-filter`: the plain text search requirement changes from "lower-cased text is contained in" to a comparison that ignores case and diacritics.

## Impact

- `src/domain/Product/ProductFilter.ts`: text normalisation in the plain text search.
- `src/domain/Product/ProductFilter.test.ts`: new test cases.
- No data, sync, Pod or UI changes. The entered text is still shown and kept in the URL exactly as typed.
