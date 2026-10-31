import "soukai-bis/patch-zod";
import {belongsToOne, defineSchema, requireBootedModel} from "soukai-bis";
import {date, number, string, url} from "zod";

// https://schema.org/ListItem
export default defineSchema({
    rdfContexts: {
        schema: "https://schema.org/",
        km: "https://vocab.kellermeister.ch/wine/",
    },
    rdfClass: "schema:ListItem",
    timestamps: true,
    history: true,

    fields: {
        productUrl: url().optional().rdfProperty("schema:subjectOf"),
        // `cellarUrl` is stored as a plain string literal (not an IRI), matching
        // the legacy schema which typed it as String rather than Key. It is
        // `.optional()` so a bottle can be constructed before its cellar is
        // assigned (the ingestion path does `createFromProduct(...)` then
        // `setCellar(...)`); soukai-bis parses required fields at construction,
        // whereas soukai-solid's `required` only applied at save-serialization.
        cellarUrl: string().optional().rdfProperty("schema:cellar"),
        orderItemId: url().optional().rdfProperty("schema:orderItemId"),

        // The bottle's rating, stored as properties of the bottle resource itself
        // so that setting it is a regular (operation-logged) change of the bottle
        // that the Pod sync transfers. See Bottle.setRating()/getRating().
        ratingValue: number().optional().rdfProperty("km:ratingValue"),
        ratedAt: date().optional().rdfProperty("km:ratedAt"),

        // Legacy: foreign key for the same-document `rating` relation (a
        // schema:Rating node embedded in the bottle document). No longer written:
        // the sync drops such nodes once the bottle is on the Pod. Kept so old
        // documents stay readable — see the `rating` relation below.
        ratingUrl: url().optional().rdfProperty("km:rating"),

        // Legacy: rating used to be a bare number on the ListItem, then moved to
        // Product. Kept read-only so old pods remain readable — Bottle.getRating()
        // surfaces it as a dateless Rating when no structured rating is present.
        legacyRating: number().optional().rdfProperty("schema:rating"),

        // When the bottle was moved to Altglass ("getrunken am"). Optional: bottles
        // disposed before this field existed have none (see getEffectiveDisposalDate).
        disposedAt: date().optional().rdfProperty("km:disposedAt"),
    },

    relations: {
        product: belongsToOne(() => requireBootedModel("SoukaiProduct"), "productUrl"),
        // Legacy: a single rating embedded in the bottle document (read-only,
        // superseded by `ratingValue`/`ratedAt`).
        rating: belongsToOne(() => requireBootedModel("SoukaiRating"), "ratingUrl").usingSameDocument(),
    },
});
