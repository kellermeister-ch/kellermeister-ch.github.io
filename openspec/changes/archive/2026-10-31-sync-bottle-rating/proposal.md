## Why

A rating given to a bottle (when it is moved to Altglass) is shown on the device where it was given, but it never reaches the Solid Pod, so other devices and a fresh login don't see it. On the dev Pod, all 6 rated bottles have a `km:rating` link to a rating node, but none of those nodes (value and date) exist in the Pod document.

The cause is in how the sync merges a document that already exists on the Pod: it only transfers changes of the bottle resource itself (its operation log). The rating is a separate node embedded in the bottle document, with no change history of its own, so it is skipped. A bottle is always on the Pod long before it is rated, so every rating is lost this way.

## What Changes

- A bottle's rating (value and date) is stored as properties of the bottle resource itself, so setting it is a regular, synchronised change of the bottle.
- Ratings already stored the old way (as an embedded node) remain readable.
- On a device that still holds such an old-style rating locally, the bottle is rewritten once in the new form, so the next sync also brings those ratings to the Pod.
- An e2e test checks that a rating given in the app ends up in the Pod document after a sync.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `bottle-rating`: adds requirements that a bottle's rating is synchronised to the Pod and to other devices, and that ratings given before this fix are repaired on the device that still has them.

## Impact

- `src/infrastructure/soukai/model/SoukaiBottle.schema.ts` / `SoukaiBottle.ts`: new rating value/date fields on the bottle; `setRating`/`getRating` use them, falling back to the old embedded node.
- `src/infrastructure/soukai/SoukaiBottleRepository.ts`: one-time local repair of old-style ratings when bottles are read.
- Pod data: rated bottles gain two new triples on `<#it>`. No change for unrated bottles, products or other resources.
- Ratings whose node only ever existed on another device cannot be recovered from this device; those bottles stay unrated until that device syncs.
