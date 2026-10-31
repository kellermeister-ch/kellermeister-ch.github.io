## ADDED Requirements

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
