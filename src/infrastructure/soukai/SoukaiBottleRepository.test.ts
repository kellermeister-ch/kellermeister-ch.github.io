import {describe, it, expect, beforeEach, vi} from "vitest";
import {turtleToQuads} from "@noeldemartin/solid-utils";
import type {InMemoryEngine} from "soukai-bis";
import {installMemoryEngine} from "../../testing/soukai.ts";
import {mintProvisional} from "../shared/resource-identity.ts";
import {SoukaiProduct} from "./model/SoukaiProduct.ts";
import {SoukaiBottle} from "./model/SoukaiBottle.ts";
import {SoukaiProductRepository} from "./SoukaiProductRepository.ts";
import {SoukaiBottleRepository} from "./SoukaiBottleRepository.ts";

describe("SoukaiBottleRepository rating repair", () => {

    let engine: InMemoryEngine;
    let bottles: SoukaiBottleRepository;
    let productUrl: string;

    beforeEach(async () => {
        engine = installMemoryEngine();
        const products = new SoukaiProductRepository(() => null);
        bottles = new SoukaiBottleRepository(() => null, products);
        productUrl = (await products.save(new SoukaiProduct({name: "Barolo"}))).getId();
    });

    /** Store a bottle document with its rating embedded as a node (previous storage form). */
    async function storeBottleWithEmbeddedRating(): Promise<string> {
        const bottleUrl = mintProvisional("bottles");
        const turtle = `
            @prefix schema: <https://schema.org/> .
            @prefix km: <https://vocab.kellermeister.ch/wine/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            <#it-metadata> a crdt:Metadata ;
                crdt:resource <${bottleUrl}> ;
                crdt:createdAt "2026-08-23T16:57:48.369Z"^^xsd:dateTime ;
                crdt:updatedAt "2026-10-04T15:26:40.122Z"^^xsd:dateTime .
            <${bottleUrl}> a schema:ListItem ;
                schema:subjectOf <${productUrl}> ;
                schema:cellar "local://cellars/altglass#it" ;
                km:rating <#r1> .
            <#r1> a schema:Rating ;
                schema:ratingValue 2 ;
                schema:dateCreated "2026-10-04T15:26:40.122Z"^^xsd:dateTime .
        `;
        await engine.createDocument(bottleUrl.split("#")[0], await turtleToQuads(turtle, {baseIRI: bottleUrl}));
        return bottleUrl;
    }

    it("stores an embedded rating as bottle properties when bottles are loaded", async () => {
        const bottleUrl = await storeBottleWithEmbeddedRating();

        const [loaded] = await bottles.fetchBottles();
        expect(loaded.getRating()?.getValue()).toBe(2);

        const stored = await SoukaiBottle.find(bottleUrl) as SoukaiBottle;
        expect(stored.ratingValue).toBe(2);
        expect(stored.ratedAt?.toISOString()).toBe("2026-10-04T15:26:40.122Z");

        // The sync transfers changes of an existing Pod document as operations,
        // so the repair must be recorded as one.
        const document = await engine.readDocument(bottleUrl.split("#")[0]);
        const operatedProperties = document.getQuads()
            .filter((quad) => quad.predicate.value === "https://vocab.noeldemartin.com/crdt/property")
            .map((quad) => quad.object.value);
        expect(operatedProperties).toContain("https://vocab.kellermeister.ch/wine/ratingValue");
        expect(operatedProperties).toContain("https://vocab.kellermeister.ch/wine/ratedAt");
    });

    it("repairs a bottle only once", async () => {
        await storeBottleWithEmbeddedRating();
        await bottles.fetchBottles();

        const save = vi.spyOn(SoukaiBottle.prototype, "save");
        await bottles.fetchBottles();

        expect(save).not.toHaveBeenCalled();
        save.mockRestore();
    });

    it("does not write unrated bottles", async () => {
        const bottle = new SoukaiBottle({cellarUrl: "local://cellars/keller#it", productUrl});
        await bottles.save(bottle);

        const save = vi.spyOn(SoukaiBottle.prototype, "save");
        await bottles.fetchBottles();

        expect(save).not.toHaveBeenCalled();
        save.mockRestore();
    });
});
