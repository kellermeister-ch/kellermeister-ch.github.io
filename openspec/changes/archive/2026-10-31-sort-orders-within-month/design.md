## Context

`KellermeisterService.groupOrdersByMonth` buckets orders by the first day of their order month and sorts the buckets descending, but pushes orders into each bucket in fetch order. `orders-component` renders each bucket's array as-is. Orders without an order date go into a single "unknown" bucket (1 January 1900).

## Goals / Non-Goals

**Goals:**
- Each month bucket is sorted by `getOrderDate()` descending before being returned.

**Non-Goals:**
- Changing the month ordering, the grouping key, or the rendering component.
- Sorting order items (bottles/products) inside an individual order.

## Decisions

- **Sort in the service, not the component.** `groupOrdersByMonth` already owns ordering of the months; sorting the orders there keeps all ordering logic in one testable place and keeps `orders-component` purely presentational. Alternative (sort in `orders-component.render`) was rejected: it would re-sort on every render and is not covered by the existing service unit tests.
- **Comparator `b.getOrderDate().getTime() - a.getOrderDate().getTime()`**, applied to each bucket after grouping. `Array.prototype.sort` is stable, so orders with an identical date keep their fetch order — this satisfies the "stable relative order" requirement without an extra tie-breaker.
- **Unknown-date bucket**: all its orders lack a date; the comparator treats a missing date as 0 so it is a no-op there and the bucket keeps fetch order.

## Risks / Trade-offs

- [Order dates are often date-only (midnight), so many same-day orders tie] → stable sort keeps them deterministic; no finer ordering is available in the data.
