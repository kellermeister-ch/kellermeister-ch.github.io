import {describe, it, expect} from "vitest";
import {formatBottleCount} from "./bottle-count-format.ts";

describe("formatBottleCount", () => {
    it("shows only the total without a matching count", () => {
        expect(formatBottleCount(764)).toBe("764 Flaschen");
        expect(formatBottleCount(1)).toBe("1 Flasche");
        expect(formatBottleCount(0)).toBe("0 Flaschen");
    });

    it("shows 'matching von total' with a matching count", () => {
        expect(formatBottleCount(764, 14)).toBe("14 von 764 Flaschen");
        expect(formatBottleCount(764, 0)).toBe("0 von 764 Flaschen");
    });

    it("chooses the unit word by the total, not the matching count", () => {
        expect(formatBottleCount(764, 1)).toBe("1 von 764 Flaschen");
        expect(formatBottleCount(1, 1)).toBe("1 von 1 Flasche");
    });
});
