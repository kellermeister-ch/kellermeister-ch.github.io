# order-month-collapse Specification

## Purpose
Defines how month sections on the order page can be collapsed and expanded.

## Requirements

### Requirement: Month sections can be collapsed and expanded
On the order page, the header of each month section SHALL toggle the visibility of that month's orders. A collapsed section SHALL show only its header, and an expanded section SHALL show its header and its list of orders. Toggling one section SHALL NOT affect any other section.

#### Scenario: Collapse a month
- **WHEN** a month section is expanded and the user activates its header
- **THEN** that month's order list is hidden and only the header remains visible

#### Scenario: Expand a month
- **WHEN** a month section is collapsed and the user activates its header
- **THEN** that month's order list is shown again

#### Scenario: Other months are unaffected
- **WHEN** the user collapses one month section
- **THEN** all other month sections keep their current state

### Requirement: Month sections start expanded
Every month section SHALL be expanded when the order page is first shown.

#### Scenario: Initial page load
- **WHEN** the user opens the order page
- **THEN** all month sections show their orders

### Requirement: Collapse state is indicated and accessible
The month header SHALL show a chevron indicating whether the section is expanded or collapsed. When collapsed, it SHALL also show the number of orders in that month. The header SHALL be a button with `aria-expanded` reflecting the state, so it can be operated with the keyboard (Enter/Space).

#### Scenario: Collapsed header shows count
- **WHEN** a month section with 3 orders is collapsed
- **THEN** its header shows the month, a collapsed-state chevron and the count 3, and has `aria-expanded="false"`

#### Scenario: Keyboard toggle
- **WHEN** the month header has keyboard focus and the user presses Enter or Space
- **THEN** the section toggles between collapsed and expanded

### Requirement: Collapse state stays with its month
When the list of month sections is re-rendered while the page is open (e.g. after changing a filter), each section's collapse state SHALL stay with its month and SHALL NOT move to a different month.

#### Scenario: Filter removes a month
- **WHEN** the user has collapsed "August 2026", and then applies a filter that removes "September 2026" from the list
- **THEN** "August 2026" is still collapsed and no other month has become collapsed

### Requirement: Orders within a month are listed newest first
Within each month section on the order page, orders SHALL be listed by order date in descending order, so the most recently ordered entry is at the top of its month. This SHALL also hold while a filter is active. Orders with the same order date SHALL keep a stable relative order.

#### Scenario: Newest order on top
- **WHEN** the month "Oktober 2026" contains orders dated 3 October, 28 October and 15 October 2026
- **THEN** the section lists them in the order 28 October, 15 October, 3 October

#### Scenario: Sorting holds with an active filter
- **WHEN** a filter is active and a month section still contains several orders
- **THEN** that month's remaining orders are listed newest first

#### Scenario: Month order unchanged
- **WHEN** the order page shows several months
- **THEN** the month sections remain ordered newest month first, independent of the ordering within each month
