# product-text-filter Specification

## Purpose
Defines how the free-text filter shared by the search, cellar, cellarwork and order pages matches products, ignoring case and diacritics in plain text, including the explicit "bis <year>" drinking-window query, the "ml <size>" bottle-size query, and the "top<N>" rating query.

## Requirements

### Requirement: Drinking-window query with "bis <year>"
The text filter SHALL treat an entered text of the form `bis <year>` as a drinking-window query. The match SHALL be case-insensitive, SHALL ignore leading and trailing whitespace, SHALL allow zero or more whitespace characters between `bis` and the year, and SHALL require the year to be exactly four digits with nothing after it. For such a query, a product SHALL match only if it has a `drinkingWindowTo` whose year is less than or equal to the entered year. Products without a `drinkingWindowTo` SHALL NOT match. The regular text fields SHALL NOT be searched for a drinking-window query.

#### Scenario: Drinking window ends before the entered year
- **WHEN** the user enters `bis 2025` and a product has `drinkingWindowTo` in 2024
- **THEN** the product matches the text filter

#### Scenario: Drinking window ends in the entered year
- **WHEN** the user enters `bis 2025` and a product has `drinkingWindowTo` in 2025
- **THEN** the product matches the text filter

#### Scenario: Drinking window ends after the entered year
- **WHEN** the user enters `bis 2025` and a product has `drinkingWindowTo` in 2026
- **THEN** the product does not match the text filter

#### Scenario: Product without drinking window
- **WHEN** the user enters `bis 2025` and a product has no `drinkingWindowTo`
- **THEN** the product does not match the text filter

#### Scenario: Case and whitespace variants
- **WHEN** the user enters `Bis 2025`, `BIS2025` or `  bis   2025  `
- **THEN** the text is treated as the drinking-window query for year 2025

#### Scenario: Other text fields are not searched
- **WHEN** the user enters `bis 2025` and a product's name contains `bis 2025` but its `drinkingWindowTo` is in 2030
- **THEN** the product does not match the text filter

### Requirement: Plain text search ignores the drinking window
For any entered text that is not a drinking-window query, a bottle-size query or a rating query, the text filter SHALL match a product only if the entered text is contained in one of its name, production date, grape variety, alcohol content, country or region, ignoring case and diacritics on both sides. The `drinkingWindowTo`, the Flaschengrösse and the ratings SHALL NOT be considered.

#### Scenario: Bare year does not match by drinking window
- **WHEN** the user enters `2025` and a product's only matching attribute would be a `drinkingWindowTo` in 2024
- **THEN** the product does not match the text filter

#### Scenario: Text that only resembles the query
- **WHEN** the user enters `bis 25`, `bis 2025 rot` or `bisher`
- **THEN** the text is treated as plain text search and `drinkingWindowTo` is not considered

#### Scenario: Plain text still matches regular fields
- **WHEN** the user enters `merlot` and a product's grape variety is `Merlot`
- **THEN** the product matches the text filter

#### Scenario: Bare size does not match by bottle size
- **WHEN** the user enters `1500` and a product's only matching attribute would be a Flaschengrösse of 1500
- **THEN** the product does not match the text filter

#### Scenario: Text that only resembles the size query
- **WHEN** the user enters `ml`, `ml 1500 rot`, `1500ml` or `mlx`
- **THEN** the text is treated as plain text search and the Flaschengrösse is not considered

#### Scenario: Text that only resembles the rating query
- **WHEN** the user enters `top`, `top0`, `top4`, `top 3 rot` or `topwein`
- **THEN** the text is treated as plain text search and ratings are not considered

#### Scenario: Text without accents finds an accented name
- **WHEN** the user enters `bereche` and a product's name is `Bérêche Brut Réserve`
- **THEN** the product matches the text filter

#### Scenario: Accented text finds a name without accents
- **WHEN** the user enters `Bérêche` and a product's name is `Bereche Brut Reserve`
- **THEN** the product matches the text filter

#### Scenario: Diacritics are ignored in every searched field
- **WHEN** the user enters `rotie`, `gruner` or `osterreich` and a product's region is `Côte-Rôtie`, its grape variety is `Grüner Veltliner` or its country is `Österreich`
- **THEN** the product matches the text filter

#### Scenario: Ligatures match their spelled-out letters
- **WHEN** the user enters `coeur` and a product's name is `Cœur de Cuvée`, or the user enters `strasse` and a product's name is `Weinstraße`
- **THEN** the product matches the text filter

### Requirement: Bottle-size query with "ml <size>"
The text filter SHALL treat an entered text of the form `ml <size>` as a bottle-size query. The match SHALL be case-insensitive, SHALL ignore leading and trailing whitespace, SHALL allow zero or more whitespace characters between `ml` and the size, and SHALL require the size to be a whole number of millilitres with nothing after it. For such a query, a product SHALL match only if its Flaschengrösse (`volumeMl`) equals the entered size. Products without a Flaschengrösse SHALL NOT match. The regular text fields SHALL NOT be searched for a bottle-size query.

#### Scenario: Magnum
- **WHEN** the user enters `ml1500` and a product's Flaschengrösse is 1500
- **THEN** the product matches the text filter

#### Scenario: Different size
- **WHEN** the user enters `ml1500` and a product's Flaschengrösse is 750
- **THEN** the product does not match the text filter

#### Scenario: Product without a bottle size
- **WHEN** the user enters `ml1500` and a product has no Flaschengrösse
- **THEN** the product does not match the text filter

#### Scenario: Case and whitespace variants
- **WHEN** the user enters `ML1500`, `ml 1500` or `  Ml   1500  `
- **THEN** the text is treated as the bottle-size query for 1500 ml

#### Scenario: Other text fields are not searched
- **WHEN** the user enters `ml 750` and a product's name contains `ml 750` but its Flaschengrösse is 1500
- **THEN** the product does not match the text filter

### Requirement: Rating query with "top<N>"
The text filter SHALL treat an entered text of the form `top<N>`, with N being 1, 2 or 3, as a rating query. The match SHALL be case-insensitive, SHALL ignore leading and trailing whitespace, SHALL allow zero or more whitespace characters between `top` and N, and SHALL require nothing after N. For such a query, a product SHALL match only if at least one of its ratings (from its bottles or its legacy product ratings) has exactly the value N. Products without ratings SHALL NOT match. The regular text fields SHALL NOT be searched for a rating query.

#### Scenario: Rated 3
- **WHEN** the user enters `top3` and one of a product's ratings is 3
- **THEN** the product matches the text filter

#### Scenario: Only exact values match
- **WHEN** the user enters `top2` and a product's only rating is 3
- **THEN** the product does not match the text filter

#### Scenario: Any of several ratings
- **WHEN** the user enters `top1` and a product has the ratings 3 and 1
- **THEN** the product matches the text filter

#### Scenario: Rating on a bottle already in Altglass
- **WHEN** the user enters `top3` in a cellar, and a product listed there has a bottle in Altglass that was rated 3
- **THEN** the product matches the text filter

#### Scenario: Product without ratings
- **WHEN** the user enters `top3` and a product has no ratings
- **THEN** the product does not match the text filter

#### Scenario: Case and whitespace variants
- **WHEN** the user enters `TOP3`, `top 3` or `  Top   3  `
- **THEN** the text is treated as the rating query for 3
