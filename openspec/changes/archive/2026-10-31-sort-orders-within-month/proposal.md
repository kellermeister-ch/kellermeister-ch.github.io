## Why

On the order page, orders are grouped into month sections (newest month first), but within a month they appear in whatever order they were loaded from storage. To find the latest purchases quickly, the most recently ordered wines should be at the top of each month.

## What Changes

- Within each month section of the order page, orders are sorted by order date, descending (newest first).
- Orders with the same order date keep a stable, deterministic order.
- The order of the month sections themselves (newest month first, "unknown date" last) is unchanged.
- Applies equally when a filter (wine type, text search) is active.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `order-month-collapse`: adds a requirement that orders inside a month section are listed newest first. This spec already owns the order page's month sections.

## Impact

- `src/application/KellermeisterService.ts` — `groupOrdersByMonth` sorts each month's orders.
- `src/application/KellermeisterService.test.ts` — new unit tests for the within-month ordering.
- No data model, storage, or Pod changes.
