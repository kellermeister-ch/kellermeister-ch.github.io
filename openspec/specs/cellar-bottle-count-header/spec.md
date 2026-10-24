# cellar-bottle-count-header Specification

## Purpose

The cellar view's header names the cellar and, directly beneath that name, states how many bottles the cellar holds in total — the single most useful fact about a cellar, available without scrolling the product list and adding up its row counts. While the wine-type or search filters narrow the rows below it, the line reads `<matching> von <total>`, so the user sees both how many bottles match and how many the cellar holds. Both numbers follow the cellar's contents as bottles are added, moved, or disposed.

## Requirements

### Requirement: The cellar header shows the cellar's total bottle count

The cellar view's header SHALL display, directly below the cellar name, the total number of bottles currently held in that cellar, followed by the German unit word — `Flaschen` for any count other than one, `Flasche` for a count of exactly one.

#### Scenario: A cellar with several bottles
- **WHEN** the cellar view is shown for a cellar holding 83 bottles
- **THEN** the header shows the cellar name
- **AND** below it the text `83 Flaschen`

#### Scenario: A cellar with exactly one bottle
- **WHEN** the cellar view is shown for a cellar holding exactly one bottle
- **THEN** the header subline reads `1 Flasche`

#### Scenario: An empty cellar
- **WHEN** the cellar view is shown for a cellar holding no bottles
- **THEN** the header subline reads `0 Flaschen`

### Requirement: The count reflects the current contents of the cellar

The displayed count SHALL be recomputed whenever the cellar's bottles change while the cellar view is open, so that it never contradicts the list below it.

#### Scenario: A bottle is disposed to Altglass
- **WHEN** the user disposes a bottle of the displayed cellar to Altglass
- **THEN** the header subline shows a count one lower than before

#### Scenario: Bottles are added to the open cellar
- **WHEN** bottles are added to the cellar currently shown — for example by inbox ingestion or the footer photo-add flow — and the cellar-updated notification is raised
- **THEN** the header subline shows the increased count

#### Scenario: Another cellar is opened
- **WHEN** the user navigates from one cellar view to another cellar
- **THEN** the header subline shows the newly opened cellar's own total count

### Requirement: The subline matches the header typography at a smaller size

The count subline SHALL use the same font family, font style, and color as the existing header title, at a smaller font size — **16px** against the title's 24px — so that it reads as a subordinate line of the same header rather than as a separate UI element.

#### Scenario: Subline styling
- **WHEN** the header with the count subline is rendered
- **THEN** the subline uses the header title's font family, italic style, and primary color
- **AND** its font size is 16px, smaller than the title's 24px

### Requirement: Views without a count render the header unchanged

The header component SHALL treat the count subline as optional. Views that supply no subline — the landing, order, search, profile, and cellarwork-work views — SHALL render their header exactly as before, with no reserved empty space.

#### Scenario: A header without a subline
- **WHEN** a view renders the header without supplying a subline
- **THEN** only the title and the action buttons are shown, with the header's previous layout and height

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
