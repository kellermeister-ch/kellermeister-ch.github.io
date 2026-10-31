## Context

A bottle document on the Pod looks like this today after rating:

```
<#it> a schema:ListItem; …; km:rating <#c82e…>.      # link synced
# <#c82e…> a schema:Rating; schema:ratingValue 3; …  # node missing on the Pod
```

soukai-bis `Sync` has two paths per document:

- **create** (document not on the Pod yet): `createDocument` with all local quads. Embedded nodes go along.
- **merge** (document on both sides, `Sync.syncDocumentContents`): only operations (`crdt:SetPropertyOperation` etc.) of resources whose `rdf:type` is one of the registered application models (`ListItem`, `Product`, `Cellar`, `Order`) are exchanged.

`SoukaiRating` is not an application model and has `history: false`, so it has no operations and is not in the merge set. Bottles are created at order ingestion and synced long before they are rated, so ratings always take the merge path and the rating node is dropped. The same applies to pulling: a second device that already has the bottle only receives the `km:rating` link.

## Goals / Non-Goals

**Goals:**
- New ratings sync to the Pod and between devices through the normal operation log.
- Ratings stored locally in the old form are repaired and pushed.
- Existing Pod data stays readable.

**Non-Goals:**
- Recovering ratings that exist only on another device's local store (those heal when that device runs the new version and syncs).
- The deprecated product-level rating array (`Product.createRating`); no new writes go there.
- Fixing soukai-bis itself.

## Decisions

### Store the rating as two properties of the bottle resource

Add to `SoukaiBottle.schema.ts`:
- `ratingValue: number().optional().rdfProperty("km:ratingValue")`
- `ratedAt: date().optional().rdfProperty("km:ratedAt")`

`setRating(value)` sets both fields; `getRating()` returns a `Rating` built from them (`getId()` = bottle id), else the embedded `rating` node, else the legacy `schema:rating` number. Because the fields belong to `<#it>`, saving them records `SetPropertyOperation`s, which the merge path exchanges in both directions.

Alternatives considered:
- **Register `SoukaiRating` as an application model / enable its history.** The merge set is built from `applicationModels`, which also drive type-index container registration; a rating has no container of its own. Would need soukai-bis changes.
- **Patch soukai-bis so the merge includes same-document related nodes** (e.g. via patch-package). Fixes all embedded relations, but means maintaining a fork of a `next` snapshot dependency; better raised upstream.
- **Write the missing node with an extra PATCH after the sync.** Bypasses the operation log, so other devices would still not pull it; hacky.
- **Reuse the legacy `schema:rating` number.** Has no date, and the date is used (disposal-date fallback, rating display).

New `km:` predicates are used because `schema:ratingValue` belongs on a `schema:Rating`, not on a `ListItem`.

### Keep the old embedded node readable and stop writing it

`setRating` no longer creates a `SoukaiRating` node. The `rating` relation and `ratingUrl` stay in the schema so old documents load. `getEffectiveDisposalDate` uses `ratedAt` before the old node's date.

### Repair once on read, in the repository

In `SoukaiBottleRepository.fetchBottles`, after `loadRelation("rating")`: for each bottle with a loaded `rating` node and no `ratingValue`, copy value and date into the new fields and save it (local engine). The next sync pushes these as operations. A repaired bottle has `ratingValue` set, so it is skipped on later loads. This runs on every device; only the device that holds the node has something to repair.

## Risks / Trade-offs

- [Repair writes during a read, which can surprise callers and cost time on first load] → only bottles with an old-style rating are written (6 in the dev Pod); after that it is a no-op.
- [The Pod keeps the dangling `km:rating` link for already-synced bottles] → harmless: `getRating()` prefers the new fields; the link is ignored.
- [Other embedded relations (order seller/customer/items, product ratings) have the same merge limitation] → they are written once at creation (create path) and not edited later, so they are not affected today. Noted in the proposal; worth reporting to soukai-bis.

## Migration Plan

No manual steps. Deploy; on each device the first bottle load repairs local old-style ratings; the next sync pushes them. Rollback: older app versions ignore the new predicates and still read the embedded node where present.
