## 1. Rating as bottle properties

- [x] 1.1 Add `ratingValue` (`km:ratingValue`) and `ratedAt` (`km:ratedAt`) to `SoukaiBottle.schema.ts`; verify with `npm run build`
- [x] 1.2 Change `SoukaiBottle.setRating` to set both fields (no embedded node) and `getRating`/`getEffectiveDisposalDate` to prefer them, falling back to the embedded node and the legacy number; add unit tests for set/read, old-node fallback and legacy fallback; verify with `npm test`

## 2. Repair of old-style ratings

- [x] 2.1 In `SoukaiBottleRepository.fetchBottles`, copy value and date of a loaded embedded rating into the new fields and save the bottle when `ratingValue` is unset; add unit tests that a bottle with only an embedded node is repaired once and an already-repaired bottle is not saved again; verify with `npm test`

## 3. End-to-end sync check

- [x] 3.1 Add an e2e test (`e2e/specs/rating-sync.spec.ts`): dispose a Pod bottle with a rating, sync, and assert that the bottle's file in the e2e Pod data contains `km:ratingValue` and `km:ratedAt`; verify with `npm run test:e2e -- rating-sync`
- [x] 3.2 Run the existing rating e2e tests (`rating-on-bottle`, `altglass-sort-by-disposal`) and `sync-requests` to confirm display, disposal-date sorting and no-op sync request counts are unchanged
