## MODIFIED Requirements

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

