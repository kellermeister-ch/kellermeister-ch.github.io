# Design

## Context

`ProductFilter.filterProduct` (domain layer) runs the plain text search by lower-casing the entered text and each searched field with `toLowerCase()`, then calling `includes`. The search, cellar, cellarwork and order pages, and `KellermeisterService`, all use this one method, so a change there covers every page. Product names are stored as typed, often with accents (see proposal.md — Why).

## Goals / Non-Goals

**Goals:**
- One normalisation function, applied the same way to the entered text and to every searched field.

**Non-Goals:**
- Ignoring punctuation or whitespace differences (`cote rotie` vs `Côte-Rôtie`). This would be a separate, broader fuzzy-matching change.
- German transliteration (`ue` for `ü`, as in `gruener`). `ü` folds to `u`, so `gruner` matches but `gruener` does not.
- Changing the sort order of product names or how the entered text is shown and kept in the URL.
- Normalising the stored data.

## Decisions

### Fold with Unicode NFD and strip combining marks

`normalizeForSearch(text) = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()`, plus a small map for the letters that NFD does not decompose: `œ → oe`, `æ → ae`, `ß → ss`, `ø → o`, `đ → d`, `ł → l`. NFD also covers precomposed and decomposed input: an `é` typed on iOS (often U+0065 U+0301) and one stored as U+00E9 both fold to `e`.

- *Alternative: `Intl.Collator` with `sensitivity: 'base'`.* It compares whole strings and cannot do a substring `includes` check without a hand-written sliding window. It also depends on the runtime's ICU data. Rejected.
- *Alternative: a full transliteration library (e.g. `any-ascii`).* It would be a new dependency for a handful of characters. Rejected.

### Put it in the domain layer, beside `ProductFilter`

The function is a private static helper of `ProductFilter` and replaces the `toLowerCase()` calls in the plain text branch. It is pure string logic with no framework dependency, so it belongs in the domain layer. The special queries (`bis`, `ml`, `top`) keep their own case-insensitive regexes, because their input is ASCII.

### Fold the query once per call

The entered text is folded once at the top of the plain text branch. Each product's fields are folded per product. For the cellar sizes we have (about 1000 bottles), this costs well under a millisecond per keystroke, so no caching is needed.

## Risks / Trade-offs

- [More matches for short queries, e.g. `e` now also hits every `é`] → This is the intended behaviour, and search results are already broad for one-letter queries.
- [Folding can merge letters that are distinct in some languages (`ø` → `o`)] → This is acceptable for a search, and it is what users without that keyboard layout expect.
