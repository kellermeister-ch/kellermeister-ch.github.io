# Spec Delta

## ADDED Requirements

### Requirement: An active filter shows the matching count alongside the total

While at least one filter is active in the cellar view (a wine-type filter Sprudel, Rot, Weiss or Rosé, or a non-empty search text), the header subline SHALL read `<matching> von <total>` followed by the unit word. `<matching>` is the number of bottles in the listed product rows and `<total>` is the number of all bottles in the cellar. The unit word SHALL agree with the total.

#### Scenario: A wine-type filter is active
- **WHEN** a cellar holds 764 bottles of which 14 are red
- **AND** the user activates the `Rot` filter
- **THEN** the product rows show only the red wines
- **AND** the header subline reads `14 von 764 Flaschen`

#### Scenario: A text search is active
- **WHEN** the user enters a search text that matches products holding 9 of the cellar's 764 bottles
- **THEN** the header subline reads `9 von 764 Flaschen`

#### Scenario: Several filters are active
- **WHEN** the user activates more than one filter
- **THEN** the matching count is the number of bottles in the rows that pass all active filters together

#### Scenario: A filter matches nothing
- **WHEN** an active filter matches no bottle of a cellar holding 764 bottles
- **THEN** the header subline reads `0 von 764 Flaschen`

#### Scenario: Unit word follows the total
- **WHEN** an active filter matches exactly one bottle of a cellar holding 764 bottles
- **THEN** the header subline reads `1 von 764 Flaschen`

#### Scenario: A cellar holding a single bottle
- **WHEN** a cellar holds exactly one bottle and an active filter matches it
- **THEN** the header subline reads `1 von 1 Flasche`

#### Scenario: Filter state restored from the URL
- **WHEN** the cellar view is opened with filter parameters already present in its URL
- **THEN** the header subline shows the matching count alongside the total from the start

### Requirement: Without an active filter the subline shows only the total

When no filter is active, the header subline SHALL show only the cellar's total bottle count with its unit word, as before, with no fraction.

#### Scenario: All filters cleared
- **WHEN** the subline reads `14 von 764 Flaschen` with only the `Rot` filter active
- **AND** the user deactivates the `Rot` filter
- **THEN** the header subline reads `764 Flaschen`

#### Scenario: Search text cleared
- **WHEN** a text search is the only active filter
- **AND** the user clears the search text
- **THEN** the header subline shows only the cellar total

### Requirement: The matching count follows filter and content changes

The matching count SHALL be recomputed whenever a filter is toggled, the search text changes, or the cellar's bottles change while the view is open. It SHALL always equal the sum of the bottle counts in the listed rows.

#### Scenario: Toggling an additional filter
- **WHEN** a filter is active and the user toggles another wine-type filter
- **THEN** the matching count changes to the number of bottles in the newly listed rows
- **AND** the total stays the same

#### Scenario: Disposing a matching bottle
- **WHEN** the subline reads `14 von 764 Flaschen` with the `Rot` filter active
- **AND** the user disposes one listed red bottle to Altglass
- **THEN** the header subline reads `13 von 763 Flaschen`

## REMOVED Requirements

### Requirement: The count is the cellar total, independent of active filters
**Reason**: Users want to see how many bottles match the active filter, in addition to the cellar total.
**Migration**: Replaced by "An active filter shows the matching count alongside the total" and "Without an active filter the subline shows only the total". The total is still shown in every state, as the denominator while a filter is active.
