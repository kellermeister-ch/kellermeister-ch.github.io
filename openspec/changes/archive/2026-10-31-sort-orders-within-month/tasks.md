## 1. Sort orders within each month

- [x] 1.1 In `KellermeisterService.groupOrdersByMonth`, sort each month's orders by order date descending (missing date treated as 0, stable for ties); verify with `npm run build`
- [x] 1.2 Add `ordersGroupedByMonth` unit tests in `src/application/KellermeisterService.test.ts`: orders within a month are newest first, month order stays newest first, and same-date orders keep their relative order; verify with `npm test`

## 2. Integration check

- [x] 2.1 Open the order page (`npm run dev`) and confirm that in each month section the most recently ordered entry is on top, with and without a wine-type filter
