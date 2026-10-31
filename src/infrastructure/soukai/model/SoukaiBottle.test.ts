import {describe, it, expect, beforeEach} from "vitest";
import {turtleToQuads} from "@noeldemartin/solid-utils";
import {installMemoryEngine} from "../../../testing/soukai.ts";
import {SoukaiBottle} from "./SoukaiBottle.ts";
import type {InMemoryEngine} from "soukai-bis";

const BOTTLE_URL = "local://bottles/legacy#it";

describe("SoukaiBottle legacy price", () => {

    beforeEach(() => {
        installMemoryEngine();
    });

    it("does not read a legacy schema:price / schema:priceCurrency stored on the bottle", async () => {
        const turtle = `
            @prefix schema: <https://schema.org/> .
            <${BOTTLE_URL}>
                a schema:ListItem ;
                schema:subjectOf <local://products/barolo#it> ;
                schema:cellar "local://cellars/keller#it" ;
                schema:price 25 ;
                schema:priceCurrency "CHF" .
        `;
        const quads = await turtleToQuads(turtle, {baseIRI: BOTTLE_URL});

        const bottle = await SoukaiBottle.createFromRDF(quads, {url: BOTTLE_URL}) as SoukaiBottle;

        expect(bottle).not.toBeNull();
        expect(bottle.getCellar()).toBe("local://cellars/keller#it");
        const attributes = bottle.getAttributes() as Record<string, unknown>;
        expect(attributes).not.toHaveProperty("price");
        expect(attributes).not.toHaveProperty("priceCurrency");
        expect("getPrice" in bottle).toBe(false);
        expect("getPriceCurrency" in bottle).toBe(false);
    });
});

describe("SoukaiBottle disposal date", () => {

    beforeEach(() => {
        installMemoryEngine();
    });

    it("persists the disposal date across save and reload", async () => {
        const disposedAt = new Date("2026-09-01T18:30:00Z");
        const bottle = new SoukaiBottle({cellarUrl: "local://cellars/altglass#it"});
        bottle.setDisposedAt(disposedAt);
        await bottle.save();

        const reloaded = await SoukaiBottle.find(bottle.getId()) as SoukaiBottle;

        expect(reloaded.getDisposedAt()?.getTime()).toBe(disposedAt.getTime());
    });

    it("loads a bottle without a stored disposal date", async () => {
        const turtle = `
            @prefix schema: <https://schema.org/> .
            <${BOTTLE_URL}>
                a schema:ListItem ;
                schema:cellar "local://cellars/altglass#it" .
        `;
        const quads = await turtleToQuads(turtle, {baseIRI: BOTTLE_URL});

        const bottle = await SoukaiBottle.createFromRDF(quads, {url: BOTTLE_URL}) as SoukaiBottle;

        expect(bottle.getCellar()).toBe("local://cellars/altglass#it");
        expect(bottle.getDisposedAt()).toBeUndefined();
    });

    it("prefers the stored disposal date over the rating date", async () => {
        const bottle = new SoukaiBottle({cellarUrl: "local://cellars/altglass#it"});
        bottle.setRating(3);
        bottle.ratedAt = new Date("2026-01-01T00:00:00Z");
        const disposedAt = new Date("2026-09-01T00:00:00Z");
        bottle.setDisposedAt(disposedAt);

        expect(bottle.getEffectiveDisposalDate()?.getTime()).toBe(disposedAt.getTime());
    });

    it("falls back to the rating date without a stored disposal date", async () => {
        const bottle = new SoukaiBottle({cellarUrl: "local://cellars/altglass#it"});
        bottle.setRating(3);
        const ratingDate = new Date("2026-01-01T00:00:00Z");
        bottle.ratedAt = ratingDate;
        bottle.updatedAt = new Date("2026-05-01T00:00:00Z");

        expect(bottle.getEffectiveDisposalDate()?.getTime()).toBe(ratingDate.getTime());
    });

    it("falls back to the last modification without disposal date or rating", async () => {
        const bottle = new SoukaiBottle({cellarUrl: "local://cellars/altglass#it"});
        await bottle.save();

        expect(bottle.getEffectiveDisposalDate()).toBeInstanceOf(Date);
        expect(bottle.getEffectiveDisposalDate()?.getTime()).toBe(bottle.updatedAt?.getTime());
    });
});

describe("SoukaiBottle rating", () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = installMemoryEngine();
    });

    async function bottleFromTurtle(body: string): Promise<SoukaiBottle> {
        const turtle = `
            @prefix schema: <https://schema.org/> .
            @prefix km: <https://vocab.kellermeister.ch/wine/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
            ${body}
        `;
        // Store the document so the same-document `rating` relation can be
        // loaded from the engine, as it is for bottles read from the local store.
        await engine.createDocument(BOTTLE_URL.split("#")[0], await turtleToQuads(turtle, {baseIRI: BOTTLE_URL}));
        const bottle = await SoukaiBottle.find(BOTTLE_URL) as SoukaiBottle;
        await bottle.loadRelation("rating");
        return bottle;
    }

    it("stores the rating as properties of the bottle resource", async () => {
        const bottle = new SoukaiBottle({cellarUrl: "local://cellars/altglass#it"});
        bottle.setRating(3);
        await bottle.save();

        const reloaded = await SoukaiBottle.find(bottle.getId()) as SoukaiBottle;
        await reloaded.loadRelation("rating");

        expect(reloaded.ratingValue).toBe(3);
        expect(reloaded.ratedAt).toBeInstanceOf(Date);
        expect(reloaded.ratingUrl).toBeUndefined();
        expect(reloaded.getRating()?.getValue()).toBe(3);
        expect(reloaded.getRating()?.getDate()?.getTime()).toBe(reloaded.ratedAt?.getTime());
        expect(reloaded.getRating()?.getId()).toBe(reloaded.getId());
    });

    it("replaces the rating when the bottle is rated again", async () => {
        const bottle = new SoukaiBottle({cellarUrl: "local://cellars/altglass#it"});
        bottle.setRating(1);
        bottle.setRating(3);

        expect(bottle.getRating()?.getValue()).toBe(3);
    });

    it("has no rating when never rated", async () => {
        const bottle = await bottleFromTurtle(`
            <${BOTTLE_URL}> a schema:ListItem ; schema:cellar "local://cellars/keller#it" .
        `);

        expect(bottle.getRating()).toBeUndefined();
        expect(bottle.adoptEmbeddedRating()).toBe(false);
    });

    it("reads a rating embedded as a node (previous storage form)", async () => {
        const bottle = await bottleFromTurtle(`
            <${BOTTLE_URL}> a schema:ListItem ;
                schema:cellar "local://cellars/altglass#it" ;
                km:rating <#r1> .
            <#r1> a schema:Rating ;
                schema:ratingValue 2 ;
                schema:dateCreated "2026-10-04T15:26:40.122Z"^^xsd:dateTime .
        `);

        expect(bottle.getRating()?.getValue()).toBe(2);
        expect(bottle.getRating()?.getDate()?.toISOString()).toBe("2026-10-04T15:26:40.122Z");
    });

    it("reads a legacy numeric schema:rating as a dateless rating", async () => {
        const bottle = await bottleFromTurtle(`
            <${BOTTLE_URL}> a schema:ListItem ;
                schema:cellar "local://cellars/altglass#it" ;
                schema:rating 1 .
        `);

        expect(bottle.getRating()?.getValue()).toBe(1);
        expect(bottle.getRating()?.getDate()).toBeUndefined();
    });

    it("adopts an embedded rating into the bottle properties once", async () => {
        const bottle = await bottleFromTurtle(`
            <${BOTTLE_URL}> a schema:ListItem ;
                schema:cellar "local://cellars/altglass#it" ;
                km:rating <#r1> .
            <#r1> a schema:Rating ;
                schema:ratingValue 2 ;
                schema:dateCreated "2026-10-04T15:26:40.122Z"^^xsd:dateTime .
        `);

        expect(bottle.adoptEmbeddedRating()).toBe(true);
        expect(bottle.ratingValue).toBe(2);
        expect(bottle.ratedAt?.toISOString()).toBe("2026-10-04T15:26:40.122Z");
        expect(bottle.adoptEmbeddedRating()).toBe(false);
    });

    it("does not let an embedded rating override the bottle's rating properties", async () => {
        const bottle = await bottleFromTurtle(`
            <${BOTTLE_URL}> a schema:ListItem ;
                schema:cellar "local://cellars/altglass#it" ;
                km:ratingValue 3 ;
                km:rating <#r1> .
            <#r1> a schema:Rating ; schema:ratingValue 2 .
        `);

        expect(bottle.getRating()?.getValue()).toBe(3);
        expect(bottle.adoptEmbeddedRating()).toBe(false);
    });
});
